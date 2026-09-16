import type {
  Message,
  MessagePreview,
  MessageReaction,
} from "@opencord/shared/types";
import { inArray } from "drizzle-orm";

import { db } from "../../db/index.js";
import { messages } from "../../db/schema/index.js";
import {
  type AttachmentRow,
  loadAttachments,
  serializeAttachments,
} from "./attachments.js";
import { messageColumns, type MessageRow } from "./queries.js";
import { loadReactions } from "./reactions/queries.js";

export type MessageBase = Omit<
  Message,
  "attachments" | "reactions" | "replyTo"
>;

export function serializeMessage(message: MessageRow): MessageBase {
  return {
    id: message.id,
    channelId: message.channelId,
    authorId: message.authorId,
    content: message.content,
    nonce: message.nonce,
    replyToId: message.replyToId,
    pinnedAt: message.pinnedAt?.toISOString() ?? null,
    pinnedBy: message.pinnedBy,
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

function preview(row: MessageRow): MessagePreview {
  return {
    id: row.id,
    authorId: row.authorId,
    content: row.deletedAt === null ? row.content : "",
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function quotedIdsOf(rows: readonly MessageRow[]): string[] {
  return [
    ...new Set(
      rows
        .map((row) => row.replyToId)
        .filter((id): id is string => id !== null),
    ),
  ];
}

async function loadQuoted(
  rows: readonly MessageRow[],
): Promise<Map<string, MessagePreview>> {
  const ids = quotedIdsOf(rows);

  if (ids.length === 0) {
    return new Map();
  }

  const quoted = await db
    .select(messageColumns)
    .from(messages)
    .where(inArray(messages.id, ids));

  return new Map(quoted.map((row) => [row.id, preview(row)]));
}

export async function hydrateMessages(
  rows: MessageRow[],
  viewerId: string,
): Promise<Message[]> {
  const [quoted, reactions, attachments] = await Promise.all([
    loadQuoted(rows),
    loadReactions(
      rows.map((row) => row.id),
      viewerId,
    ),
    loadAttachments(rows.map((row) => row.id)),
  ]);

  const empty: MessageReaction[] = [];
  const noFiles: AttachmentRow[] = [];

  return rows.map((row) => ({
    ...serializeMessage(row),
    replyTo:
      row.replyToId === null ? null : (quoted.get(row.replyToId) ?? null),
    reactions: reactions.get(row.id) ?? empty,
    attachments: serializeAttachments(
      row.channelId,
      attachments.get(row.id) ?? noFiles,
    ),
  }));
}

export async function hydrateOneMessage(
  row: MessageRow,
  viewerId: string,
): Promise<Message> {
  const [message] = await hydrateMessages([row], viewerId);

  if (message === undefined) {
    throw new Error("the serializer returned no message");
  }

  return message;
}
