import { REACTION_EMOJI } from "@opencord/shared/constants";
import type { MessageReaction } from "@opencord/shared/types";
import { inArray, sql } from "drizzle-orm";

import { db } from "../../../db/index.js";
import { reactions } from "../../../db/schema/index.js";

const ORDER = new Map<string, number>(
  REACTION_EMOJI.map((emoji, index) => [emoji, index]),
);

function rank(emoji: string): number {
  return ORDER.get(emoji) ?? REACTION_EMOJI.length;
}

export async function loadReactions(
  messageIds: readonly string[],
  userId: string,
): Promise<Map<string, MessageReaction[]>> {
  const grouped = new Map<string, MessageReaction[]>();

  if (messageIds.length === 0) {
    return grouped;
  }

  const rows = await db
    .select({
      messageId: reactions.messageId,
      emoji: reactions.emoji,
      count: sql<number>`count(*)::int`,
      me: sql<boolean>`bool_or(${reactions.userId} = ${userId})`,
    })
    .from(reactions)
    .where(inArray(reactions.messageId, [...messageIds]))
    .groupBy(reactions.messageId, reactions.emoji);

  for (const row of rows) {
    const entries = grouped.get(row.messageId) ?? [];

    entries.push({ emoji: row.emoji, count: row.count, me: row.me });
    grouped.set(row.messageId, entries);
  }

  for (const entries of grouped.values()) {
    entries.sort((left, right) => rank(left.emoji) - rank(right.emoji));
  }

  return grouped;
}
