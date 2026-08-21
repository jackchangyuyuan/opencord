import type { SendMessageInput } from "@opencord/shared/schemas";
import { and, eq, sql } from "drizzle-orm";

import type { ChannelRow } from "../../access/context.js";
import { db } from "../../db/index.js";
import { channels, messages } from "../../db/schema/index.js";
import { nonceReused, notFound } from "../../lib/errors.js";
import { findLiveMessage, type MessageRow } from "./queries.js";

export interface SendMessageResult {
  created: boolean;
  row: MessageRow;
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

      if (
        existing?.channelId !== channel.id ||
        existing.content !== input.content ||
        existing.replyToId !== replyToId
      ) {
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
