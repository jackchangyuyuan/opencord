import { Permissions } from "@opencord/shared/permissions";
import { typingStartSchema } from "@opencord/shared/schemas";

import { loadChannelContext } from "../access/context.js";
import { AppError } from "../lib/errors.js";
import { typingLimiter } from "../middleware/rate-limit.js";
import { channelRoom } from "./rooms.js";
import type { AppSocket } from "./types.js";

const REQUIRED = Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES;

export async function handleTypingStart(
  socket: AppSocket,
  payload: unknown,
): Promise<void> {
  const parsed = typingStartSchema.safeParse(payload);

  if (!parsed.success) {
    return;
  }

  const userId = socket.data.user.id;
  const { channelId } = parsed.data;

  if (!socket.rooms.has(channelRoom(channelId))) {
    return;
  }

  const verdict = await typingLimiter.consume(`${userId}:${channelId}`);

  if (verdict === "abusive") {
    socket.disconnect(true);
    return;
  }

  if (verdict === "limited") {
    return;
  }

  const context = await loadChannelContext(channelId, userId).catch(
    (error: unknown) => {
      if (error instanceof AppError) {
        return null;
      }

      throw error;
    },
  );

  if (context === null || (context.permissions & REQUIRED) !== REQUIRED) {
    return;
  }

  socket.broadcast.to(channelRoom(channelId)).emit("typing:start", {
    channelId,
    userId,
  });
}
