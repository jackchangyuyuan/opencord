import { MESSAGE_MIN_LENGTH } from "@opencord/shared/constants";
import { Permissions } from "@opencord/shared/permissions";
import type {
  EditMessageInput,
  SendMessageInput,
} from "@opencord/shared/schemas";
import type { Message } from "@opencord/shared/types";
import { and, eq, sql } from "drizzle-orm";

import type { ChannelContext, ChannelRow } from "../../access/context.js";
import { db, type Transaction } from "../../db/index.js";
import { channels, mentions, messages } from "../../db/schema/index.js";
import { writeAudit } from "../../lib/audit.js";
import {
  contentRequired,
  forbidden,
  nonceReused,
  notFound,
} from "../../lib/errors.js";
import { consumeQuota, type QuotaSubject } from "../../lib/quota.js";
import {
  emitMessageCreate,
  emitMessageDelete,
  emitMessageUpdate,
} from "../../socket/emit.js";
import { actorPosition, highestPositionOf } from "../roles/queries.js";
import { requireBelowActor } from "../roles/service.js";
import {
  hasAttachments,
  prepareAttachments,
  writeAttachments,
} from "./attachments.js";
import { applyMentions, findMentionCandidates } from "./mentions.js";
import {
  findLiveMessage,
  findMessageByNonce,
  messageColumns,
  type MessageRow,
  resolveMentions,
} from "./queries.js";
import { serializeOneMessage } from "./serialize.js";

export interface SendMessageResult {
  created: boolean;
  message: Message;
}

function mayMentionEveryone(context: ChannelContext): boolean {
  return (context.permissions & Permissions.MENTION_EVERYONE) !== 0;
}

interface PreparedContent {
  content: string;
  mentionedUserIds: string[];
  everyone: boolean;
}

async function prepareContent(
  serverId: string | null,
  authorId: string,
  raw: string,
): Promise<PreparedContent> {
  if (serverId === null) {
    return { content: raw, mentionedUserIds: [], everyone: false };
  }

  const candidates = findMentionCandidates(raw);
  const resolution = await resolveMentions(serverId, candidates);

  return {
    content: applyMentions(raw, resolution),
    mentionedUserIds: [...resolution.users.values()].filter(
      (userId) => userId !== authorId,
    ),
    everyone: candidates.everyone,
  };
}

function writeMentions(
  tx: Transaction,
  channelId: string,
  messageId: string,
  userIds: string[],
): Promise<unknown> {
  if (userIds.length === 0) {
    return Promise.resolve();
  }

  return tx
    .insert(mentions)
    .values(userIds.map((userId) => ({ userId, messageId, channelId })))
    .onConflictDoNothing();
}

function advanceEveryoneWatermark(
  tx: Transaction,
  channelId: string,
  messageId: string,
): Promise<unknown> {
  return tx
    .update(channels)
    .set({
      lastEveryoneMentionId: sql`greatest(${channels.lastEveryoneMentionId}, ${messageId}::uuid)`,
    })
    .where(eq(channels.id, channelId));
}

function repairEveryoneWatermark(
  tx: Transaction,
  channelId: string,
  affectedMessageId: string,
): Promise<unknown> {
  return tx
    .update(channels)
    .set({
      lastEveryoneMentionId: sql`(select ${messages.id} from ${messages} where ${messages.channelId} = ${channelId} and ${messages.deletedAt} is null and ${messages.mentionsEveryone} order by ${messages.id} desc limit 1)`,
    })
    .where(
      and(
        eq(channels.id, channelId),
        eq(channels.lastEveryoneMentionId, affectedMessageId),
      ),
    );
}

function isReplay(
  existing: MessageRow | undefined,
  channelId: string,
  content: string,
  replyToId: string | null,
): existing is MessageRow {
  return (
    existing?.channelId === channelId &&
    existing.content === content &&
    existing.replyToId === replyToId
  );
}

export async function sendMessage(
  context: ChannelContext,
  channel: ChannelRow,
  author: QuotaSubject,
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const authorId = author.id;

  const replyToId = input.replyToId ?? null;
  const prepared = await prepareContent(
    context.server?.server.id ?? null,
    authorId,
    input.content,
  );
  const broadcast = prepared.everyone && mayMentionEveryone(context);
  const files = await prepareAttachments(authorId, input.attachments ?? []);

  if (
    replyToId !== null &&
    (await findLiveMessage(channel.id, replyToId)) === undefined
  ) {
    const existing = await findMessageByNonce(authorId, input.nonce);

    if (isReplay(existing, channel.id, prepared.content, replyToId)) {
      return {
        created: false,
        message: await serializeOneMessage(existing, authorId),
      };
    }

    throw notFound(
      "MESSAGE_NOT_FOUND",
      "The quoted message is not in this channel",
    );
  }

  const result = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(messages)
      .values({
        channelId: channel.id,
        authorId,
        content: prepared.content,
        nonce: input.nonce,
        replyToId,
        mentionsEveryone: broadcast,
      })
      .onConflictDoNothing({
        target: [messages.authorId, messages.nonce],
        where: sql`${messages.nonce} is not null`,
      })
      .returning(messageColumns);

    if (inserted === undefined) {
      const [existing] = await tx
        .select(messageColumns)
        .from(messages)
        .where(
          and(eq(messages.authorId, authorId), eq(messages.nonce, input.nonce)),
        );

      if (!isReplay(existing, channel.id, prepared.content, replyToId)) {
        throw nonceReused();
      }

      return { created: false, row: existing };
    }

    await consumeQuota(tx, author, "messagesSent");

    await consumeQuota(
      tx,
      author,
      "uploadBytes",
      files.reduce((total, file) => total + file.size, 0),
    );

    await tx
      .update(channels)
      .set({
        lastMessageId: sql`greatest(${channels.lastMessageId}, ${inserted.id}::uuid)`,
      })
      .where(eq(channels.id, channel.id));

    await writeMentions(tx, channel.id, inserted.id, prepared.mentionedUserIds);
    await writeAttachments(tx, inserted.id, files);

    if (broadcast) {
      await advanceEveryoneWatermark(tx, channel.id, inserted.id);
    }

    return { created: true, row: inserted };
  });

  const serialized = await serializeOneMessage(result.row, authorId);

  if (result.created) {
    emitMessageCreate(serialized);
  }

  return { created: result.created, message: serialized };
}

export interface DeletedMessage {
  channelId: string;
  messageId: string;
  deletedAt: string;
}

async function requireLiveMessage(
  channelId: string,
  messageId: string,
): Promise<MessageRow> {
  const message = await findLiveMessage(channelId, messageId);

  if (message === undefined) {
    throw notFound("MESSAGE_NOT_FOUND", "That message is not in this channel");
  }

  return message;
}

export async function editMessage(
  context: ChannelContext,
  channel: ChannelRow,
  actorId: string,
  messageId: string,
  input: EditMessageInput,
): Promise<Message> {
  const message = await requireLiveMessage(channel.id, messageId);

  if (message.authorId !== actorId) {
    throw forbidden("NOT_THE_AUTHOR", "Only the author may edit a message");
  }

  if (
    input.content.length < MESSAGE_MIN_LENGTH &&
    !(await hasAttachments(message.id))
  ) {
    throw contentRequired();
  }

  const prepared = await prepareContent(
    context.server?.server.id ?? null,
    actorId,
    input.content,
  );

  const broadcast = prepared.everyone && mayMentionEveryone(context);

  const edited = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(messages)
      .set({
        content: prepared.content,
        mentionsEveryone: broadcast,
        editedAt: new Date(),
      })
      .where(eq(messages.id, message.id))
      .returning(messageColumns);

    if (row === undefined) {
      throw new Error("Message edit returned no row");
    }

    await tx.delete(mentions).where(eq(mentions.messageId, message.id));
    await writeMentions(tx, channel.id, message.id, prepared.mentionedUserIds);

    if (broadcast) {
      await advanceEveryoneWatermark(tx, channel.id, message.id);
    } else {
      await repairEveryoneWatermark(tx, channel.id, message.id);
    }

    return row;
  });

  const serialized = await serializeOneMessage(edited, actorId);

  emitMessageUpdate(serialized);

  return serialized;
}

export async function softDeleteMessage(
  tx: Transaction,
  channelId: string,
  messageId: string,
  deletedAt: Date,
): Promise<void> {
  await tx
    .update(messages)
    .set({ deletedAt, pinnedAt: null, pinnedBy: null })
    .where(eq(messages.id, messageId));

  await tx.delete(mentions).where(eq(mentions.messageId, messageId));

  await tx
    .update(channels)
    .set({
      lastMessageId: sql`(select ${messages.id} from ${messages} where ${messages.channelId} = ${channelId} and ${messages.deletedAt} is null order by ${messages.id} desc limit 1)`,
    })
    .where(
      and(eq(channels.id, channelId), eq(channels.lastMessageId, messageId)),
    );

  await repairEveryoneWatermark(tx, channelId, messageId);
}

export async function deleteMessage(
  context: ChannelContext,
  channel: ChannelRow,
  actorId: string,
  messageId: string,
): Promise<DeletedMessage> {
  const message = await requireLiveMessage(channel.id, messageId);
  const byModerator = message.authorId !== actorId;

  if (byModerator) {
    if (context.server === null) {
      throw forbidden(
        "NOT_THE_AUTHOR",
        "Only the author may delete a direct message",
      );
    }

    if ((context.permissions & Permissions.MANAGE_MESSAGES) === 0) {
      throw forbidden();
    }

    if (context.server.server.ownerId === message.authorId) {
      throw forbidden("TARGET_IS_OWNER", "The owner is outside the hierarchy");
    }

    requireBelowActor(
      await highestPositionOf(context.server.server.id, message.authorId),
      actorPosition(context.server, actorId),
    );
  }

  const deletedAt = new Date();

  await db.transaction(async (tx) => {
    await softDeleteMessage(tx, channel.id, message.id, deletedAt);

    if (byModerator && context.server !== null) {
      await writeAudit(tx, {
        serverId: context.server.server.id,
        actorId,
        action: "message_delete",
        targetType: "message",
        targetId: message.id,
        metadata: { channelId: channel.id, authorId: message.authorId },
      });
    }
  });

  const payload = {
    channelId: channel.id,
    messageId: message.id,
    deletedAt: deletedAt.toISOString(),
  };

  emitMessageDelete(payload);

  return payload;
}
