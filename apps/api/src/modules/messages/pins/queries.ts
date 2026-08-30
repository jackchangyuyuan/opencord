import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { db, type Transaction } from "../../../db/index.js";
import { messages } from "../../../db/schema/index.js";
import { messageColumns, type MessageRow } from "../queries.js";

export const PIN_LIMIT = 50;

export function listPinnedMessages(channelId: string): Promise<MessageRow[]> {
  return db
    .select(messageColumns)
    .from(messages)
    .where(
      and(
        eq(messages.channelId, channelId),
        isNotNull(messages.pinnedAt),
        isNull(messages.deletedAt),
      ),
    )
    .orderBy(desc(messages.pinnedAt), desc(messages.id))
    .limit(PIN_LIMIT + 1);
}

export async function countPins(
  executor: Transaction | typeof db,
  channelId: string,
): Promise<number> {
  const [row] = await executor
    .select({ pinned: count() })
    .from(messages)
    .where(
      and(
        eq(messages.channelId, channelId),
        isNotNull(messages.pinnedAt),
        isNull(messages.deletedAt),
      ),
    );

  return row?.pinned ?? 0;
}
