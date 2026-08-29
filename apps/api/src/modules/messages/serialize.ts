import type { Message, MessagePreview } from "@opencord/shared/types";
import { inArray } from "drizzle-orm";

import { db } from "../../db/index.js";
import { messages } from "../../db/schema/index.js";
import {
  messageColumns,
  type MessageRow,
  serializeMessage,
} from "./queries.js";
import { loadReactions } from "./reactions/queries.js";

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
  viewerId: string,
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
      : await db
          .select(messageColumns)
          .from(messages)
          .where(inArray(messages.id, quotedIds));

  const reactions = await loadReactions(
    rows.map((row) => row.id),
    viewerId,
  );

  return rows.map((row) => {
    const target = quoted.find((candidate) => candidate.id === row.replyToId);

    return {
      ...serializeMessage(row),
      replyTo: target === undefined ? null : preview(target),
      reactions: reactions.get(row.id) ?? [],
    };
  });
}

export async function serializeOneMessage(
  row: MessageRow,
  viewerId: string,
): Promise<Message> {
  const [message] = await serializeMessages([row], viewerId);

  if (message === undefined) {
    throw new Error("the serializer returned no message");
  }

  return message;
}
