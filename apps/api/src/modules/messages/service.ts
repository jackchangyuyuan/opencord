import { Permissions } from "@opencord/shared/permissions";
import type {
  EditMessageInput,
  SendMessageInput,
} from "@opencord/shared/schemas";
import { and, eq, sql } from "drizzle-orm";

import type { ChannelRow, ServerContext } from "../../access/context.js";
import { db } from "../../db/index.js";
import { channels, messages } from "../../db/schema/index.js";
import { writeAudit } from "../../lib/audit.js";
import { forbidden, nonceReused, notFound } from "../../lib/errors.js";
import { actorPosition, highestPositionOf } from "../roles/queries.js";
import { requireBelowActor } from "../roles/service.js";
import {
  findLiveMessage,
  findMessageByNonce,
  type MessageRow,
} from "./queries.js";

export interface SendMessageResult {
  created: boolean;
  row: MessageRow;
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
  channel: ChannelRow,
  authorId: string,
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const replyToId = input.replyToId ?? null;

  if (
    replyToId !== null &&
    (await findLiveMessage(channel.id, replyToId)) === undefined
  ) {
    const existing = await findMessageByNonce(authorId, input.nonce);

    if (isReplay(existing, channel.id, input.content, replyToId)) {
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
        content: input.content,
        nonce: input.nonce,
        replyToId,
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

      if (!isReplay(existing, channel.id, input.content, replyToId)) {
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
  channel: ChannelRow,
  actorId: string,
  messageId: string,
  input: EditMessageInput,
): Promise<MessageRow> {
  const message = await requireLiveMessage(channel.id, messageId);

  if (message.authorId !== actorId) {
    throw forbidden("NOT_THE_AUTHOR", "Only the author may edit a message");
  }

  const [edited] = await db
    .update(messages)
    .set({ content: input.content, editedAt: new Date() })
    .where(eq(messages.id, message.id))
    .returning();

  if (edited === undefined) {
    throw new Error("Message edit returned no row");
  }

  return edited;
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
