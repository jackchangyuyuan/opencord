import type { Message } from "@opencord/shared/types";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../db/index.js";
import { messages } from "../../db/schema/index.js";

export type MessageRow = typeof messages.$inferSelect;

export function serializeMessage(message: MessageRow): Message {
  return {
    id: message.id,
    channelId: message.channelId,
    authorId: message.authorId,
    content: message.content,
    nonce: message.nonce,
    replyToId: message.replyToId,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

export async function findLiveMessage(
  channelId: string,
  messageId: string,
): Promise<MessageRow | undefined> {
  const [message] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.channelId, channelId),
        isNull(messages.deletedAt),
      ),
    );

  return message;
}
