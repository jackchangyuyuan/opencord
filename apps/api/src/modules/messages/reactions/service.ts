import { isReactionEmoji } from "@opencord/shared/constants";
import { and, eq } from "drizzle-orm";

import { db } from "../../../db/index.js";
import { reactions } from "../../../db/schema/index.js";
import { AppError, notFound } from "../../../lib/errors.js";
import { emitReaction } from "../../../socket/emit.js";
import { findLiveMessage } from "../queries.js";

function requireCuratedEmoji(emoji: string): void {
  if (!isReactionEmoji(emoji)) {
    throw new AppError(
      400,
      "INVALID_EMOJI",
      "That emoji is not in the reaction set",
    );
  }
}

async function requireLiveMessage(
  channelId: string,
  messageId: string,
): Promise<void> {
  const message = await findLiveMessage(channelId, messageId);

  if (message === undefined) {
    throw notFound("MESSAGE_NOT_FOUND", "Message not found");
  }
}

export async function addReaction(
  channelId: string,
  userId: string,
  messageId: string,
  emoji: string,
): Promise<void> {
  requireCuratedEmoji(emoji);
  await requireLiveMessage(channelId, messageId);

  const inserted = await db
    .insert(reactions)
    .values({ messageId, userId, emoji })
    .onConflictDoNothing()
    .returning({ emoji: reactions.emoji });

  if (inserted.length > 0) {
    emitReaction("reaction:add", {
      channelId,
      messageId,
      userId,
      emoji,
    });
  }
}

export async function removeReaction(
  channelId: string,
  userId: string,
  messageId: string,
  emoji: string,
): Promise<void> {
  requireCuratedEmoji(emoji);
  await requireLiveMessage(channelId, messageId);

  const removed = await db
    .delete(reactions)
    .where(
      and(
        eq(reactions.messageId, messageId),
        eq(reactions.userId, userId),
        eq(reactions.emoji, emoji),
      ),
    )
    .returning({ emoji: reactions.emoji });

  if (removed.length > 0) {
    emitReaction("reaction:remove", {
      channelId,
      messageId,
      userId,
      emoji,
    });
  }
}
