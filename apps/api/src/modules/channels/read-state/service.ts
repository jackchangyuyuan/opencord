import { notFound } from "../../../lib/errors.js";
import { emitReadUpdate } from "../../../socket/emit.js";
import { countUnreadMentions } from "./unread.js";
import { advanceWatermark } from "./watermark.js";

export interface ReadState {
  channelId: string;
  lastReadMessageId: string;
  mentionCount: number;
}

export async function markRead(
  userId: string,
  channelId: string,
  messageId: string,
): Promise<ReadState> {
  const lastReadMessageId = await advanceWatermark(
    userId,
    channelId,
    messageId,
  );

  if (lastReadMessageId === null) {
    throw notFound("MESSAGE_NOT_FOUND", "Message not found");
  }

  const state = {
    channelId,
    lastReadMessageId,
    mentionCount: await countUnreadMentions(userId, channelId),
  };

  emitReadUpdate(userId, state);

  return state;
}
