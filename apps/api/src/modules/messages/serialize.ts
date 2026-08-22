import type { Message, MessagePreview } from "@opencord/shared/types";
import { inArray } from "drizzle-orm";

import { db } from "../../db/index.js";
import { messages } from "../../db/schema/index.js";
import { type MessageRow, serializeMessage } from "./queries.js";

function preview(row: MessageRow): MessagePreview {
  return {
    id: row.id,
    authorId: row.authorId,
    content: row.deletedAt === null ? row.content : "",
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export async function serializeMessages(
  rows: MessageRow[],
): Promise<Message[]> {
  const quotedIds = [
    ...new Set(
      rows
        .map((row) => row.replyToId)
        .filter((id): id is string => id !== null),
    ),
  ];

  const quoted =
    quotedIds.length === 0
      ? []
      : await db.select().from(messages).where(inArray(messages.id, quotedIds));

  return rows.map((row) => {
    const target = quoted.find((candidate) => candidate.id === row.replyToId);

    return {
      ...serializeMessage(row),
      replyTo: target === undefined ? null : preview(target),
    };
  });
}

export async function serializeOneMessage(row: MessageRow): Promise<Message> {
  const [message] = await serializeMessages([row]);

  if (message === undefined) {
    throw new Error("the serializer returned no message");
  }

  return message;
}
