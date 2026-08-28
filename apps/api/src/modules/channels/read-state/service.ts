import { notFound } from "../../../lib/errors.js";
import { emitReadUpdate } from "../../../socket/emit.js";
import { advanceWatermark } from "./watermark.js";

export interface ReadState {
  channelId: string;
  lastReadMessageId: string;
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

  const state = { channelId, lastReadMessageId };

  emitReadUpdate(userId, state);

  return state;
}
