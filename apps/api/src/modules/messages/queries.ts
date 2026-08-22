import type { MessagePageQuery } from "@opencord/shared/schemas";
import type { Message } from "@opencord/shared/types";
import { and, asc, desc, eq, gt, isNull, lt, lte, type SQL } from "drizzle-orm";

import { db } from "../../db/index.js";
import { messages } from "../../db/schema/index.js";
import { decodeCursor, encodeCursor } from "../../lib/cursor.js";
import { AppError } from "../../lib/errors.js";

export type MessageRow = typeof messages.$inferSelect;

export type MessageBase = Omit<Message, "replyTo">;

export function serializeMessage(message: MessageRow): MessageBase {
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

export async function findMessageByNonce(
  authorId: string,
  nonce: string,
): Promise<MessageRow | undefined> {
  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.authorId, authorId), eq(messages.nonce, nonce)));

  return message;
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

export interface MessagePage {
  rows: MessageRow[];
  nextCursor: string | null;
}

function cursorOrThrow(cursor: string): string {
  const id = decodeCursor(cursor);

  if (id === null) {
    throw new AppError(400, "INVALID_CURSOR", "Malformed pagination cursor");
  }

  return id;
}

function livePage(
  channelId: string,
  bound: SQL | undefined,
  ascending: boolean,
  limit: number,
): Promise<MessageRow[]> {
  return db
    .select()
    .from(messages)
    .where(
      and(eq(messages.channelId, channelId), isNull(messages.deletedAt), bound),
    )
    .orderBy(ascending ? asc(messages.id) : desc(messages.id))
    .limit(limit);
}

async function around(
  channelId: string,
  anchor: string,
  limit: number,
): Promise<MessagePage> {
  const olderLimit = Math.ceil(limit / 2);
  const newerLimit = limit - olderLimit;

  const older = await livePage(
    channelId,
    lte(messages.id, anchor),
    false,
    olderLimit,
  );
  const newer =
    newerLimit === 0
      ? []
      : await livePage(channelId, gt(messages.id, anchor), true, newerLimit);

  return { rows: [...older.reverse(), ...newer], nextCursor: null };
}

export async function listChannelMessages(
  channelId: string,
  query: MessagePageQuery,
): Promise<MessagePage> {
  if (query.around !== undefined) {
    return around(channelId, cursorOrThrow(query.around), query.limit);
  }

  if (query.after !== undefined) {
    const rows = await livePage(
      channelId,
      gt(messages.id, cursorOrThrow(query.after)),
      true,
      query.limit + 1,
    );

    return paginate(rows, query.limit);
  }

  const rows = await livePage(
    channelId,
    query.before === undefined
      ? undefined
      : lt(messages.id, cursorOrThrow(query.before)),
    false,
    query.limit + 1,
  );

  return paginate(rows, query.limit);
}

function paginate(rows: MessageRow[], limit: number): MessagePage {
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    rows: page,
    nextCursor:
      rows.length > limit && last !== undefined ? encodeCursor(last.id) : null,
  };
}
