import { Permissions } from "@opencord/shared/permissions";
import type {
  EditMessageInput,
  SendMessageInput,
} from "@opencord/shared/schemas";
import { and, eq, sql } from "drizzle-orm";

import type { ChannelRow, ServerContext } from "../../access/context.js";
import { db, type Transaction } from "../../db/index.js";
import { channels, mentions, messages } from "../../db/schema/index.js";
import { writeAudit } from "../../lib/audit.js";
import { forbidden, nonceReused, notFound } from "../../lib/errors.js";
import { actorPosition, highestPositionOf } from "../roles/queries.js";
import { requireBelowActor } from "../roles/service.js";
import { applyMentions, findMentionCandidates } from "./mentions.js";
import {
  findLiveMessage,
  findMessageByNonce,
  type MessageRow,
  resolveMentions,
} from "./queries.js";

export interface SendMessageResult {
  created: boolean;
  row: MessageRow;
}

function mayMentionEveryone(context: ServerContext): boolean {
  return (context.permissions & Permissions.MENTION_EVERYONE) !== 0;
}

interface PreparedContent {
  content: string;
  mentionedUserIds: string[];
  everyone: boolean;
}

async function prepareContent(
  serverId: string,
  authorId: string,
  raw: string,
): Promise<PreparedContent> {
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
  context: ServerContext,
  channel: ChannelRow,
  authorId: string,
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const replyToId = input.replyToId ?? null;
  const prepared = await prepareContent(
    context.server.id,
    authorId,
    input.content,
  );
  const broadcast = prepared.everyone && mayMentionEveryone(context);

  if (
    replyToId !== null &&
    (await findLiveMessage(channel.id, replyToId)) === undefined
  ) {
    const existing = await findMessageByNonce(authorId, input.nonce);

    if (isReplay(existing, channel.id, prepared.content, replyToId)) {
      return { created: false, row: existing };
    }

    throw notFound(
      "MESSAGE_NOT_FOUND",
      "The quoted message is not in this channel",
    );
  }

  return db.transaction(async (tx) => {
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
      .returning();

    if (inserted === undefined) {
      const [existing] = await tx
        .select()
        .from(messages)
        .where(
          and(eq(messages.authorId, authorId), eq(messages.nonce, input.nonce)),
        );

      if (!isReplay(existing, channel.id, prepared.content, replyToId)) {
        throw nonceReused();
      }

      return { created: false, row: existing };
    }

    await tx
      .update(channels)
      .set({
        lastMessageId: sql`greatest(${channels.lastMessageId}, ${inserted.id}::uuid)`,
      })
      .where(eq(channels.id, channel.id));

    await writeMentions(tx, channel.id, inserted.id, prepared.mentionedUserIds);

    if (broadcast) {
      await advanceEveryoneWatermark(tx, channel.id, inserted.id);
    }

    return { created: true, row: inserted };
  });
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
  context: ServerContext,
  channel: ChannelRow,
  actorId: string,
  messageId: string,
  input: EditMessageInput,
): Promise<MessageRow> {
  const message = await requireLiveMessage(channel.id, messageId);

  if (message.authorId !== actorId) {
    throw forbidden("NOT_THE_AUTHOR", "Only the author may edit a message");
  }

  const prepared = await prepareContent(
    context.server.id,
    actorId,
    input.content,
  );

  const broadcast = prepared.everyone && mayMentionEveryone(context);

  return db.transaction(async (tx) => {
    const [edited] = await tx
      .update(messages)
      .set({
        content: prepared.content,
        mentionsEveryone: broadcast,
        editedAt: new Date(),
      })
      .where(eq(messages.id, message.id))
      .returning();

    if (edited === undefined) {
      throw new Error("Message edit returned no row");
    }

    await tx.delete(mentions).where(eq(mentions.messageId, message.id));
    await writeMentions(tx, channel.id, message.id, prepared.mentionedUserIds);

    if (broadcast) {
      await advanceEveryoneWatermark(tx, channel.id, message.id);
    } else {
      await repairEveryoneWatermark(tx, channel.id, message.id);
    }

    return edited;
  });
}

export async function deleteMessage(
  context: ServerContext,
  channel: ChannelRow,
  actorId: string,
  messageId: string,
): Promise<DeletedMessage> {
  const message = await requireLiveMessage(channel.id, messageId);
  const byModerator = message.authorId !== actorId;

  if (byModerator) {
    if ((context.permissions & Permissions.MANAGE_MESSAGES) === 0) {
      throw forbidden();
    }

    if (context.server.ownerId === message.authorId) {
      throw forbidden("TARGET_IS_OWNER", "The owner is outside the hierarchy");
    }

    requireBelowActor(
      await highestPositionOf(context.server.id, message.authorId),
      actorPosition(context, actorId),
    );
  }

  const deletedAt = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(messages)
      .set({ deletedAt })
      .where(eq(messages.id, message.id));

    await tx.delete(mentions).where(eq(mentions.messageId, message.id));

    await tx
      .update(channels)
      .set({
        lastMessageId: sql`(select ${messages.id} from ${messages} where ${messages.channelId} = ${channel.id} and ${messages.deletedAt} is null order by ${messages.id} desc limit 1)`,
      })
      .where(
        and(
          eq(channels.id, channel.id),
          eq(channels.lastMessageId, message.id),
        ),
      );

    await repairEveryoneWatermark(tx, channel.id, message.id);

    if (byModerator) {
      await writeAudit(tx, {
        serverId: context.server.id,
        actorId,
        action: "message_delete",
        targetType: "message",
        targetId: message.id,
        metadata: { channelId: channel.id, authorId: message.authorId },
      });
    }
  });

  return {
    channelId: channel.id,
    messageId: message.id,
    deletedAt: deletedAt.toISOString(),
  };
}
