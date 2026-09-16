import type { Message } from "@opencord/shared/types";

import { logger } from "../lib/logger.js";
import { currentSocketServer } from "./registry.js";
import {
  channelRoom,
  listUserAudienceRooms,
  serverRoom,
  userRoom,
} from "./rooms.js";

export function emitMessageCreate(message: Message): void {
  currentSocketServer()
    ?.to(channelRoom(message.channelId))
    .emit("message:create", {
      message,
    });
}

function withoutViewerReactions(message: Message): Message {
  if (message.reactions.length === 0) {
    return message;
  }

  return {
    ...message,
    reactions: message.reactions.map((reaction) => ({
      ...reaction,
      me: false,
    })),
  };
}

export function emitMessageUpdate(message: Message): void {
  currentSocketServer()
    ?.to(channelRoom(message.channelId))
    .emit("message:update", {
      message: withoutViewerReactions(message),
    });
}

export function emitMessageDelete(payload: {
  channelId: string;
  messageId: string;
  deletedAt: string;
}): void {
  currentSocketServer()
    ?.to(channelRoom(payload.channelId))
    .emit("message:delete", payload);
}

export function emitMessagePin(payload: {
  channelId: string;
  messageId: string;
  pinnedAt: string | null;
  pinnedBy: string | null;
}): void {
  currentSocketServer()
    ?.to(channelRoom(payload.channelId))
    .emit("message:pin", payload);
}

export function emitReaction(
  event: "reaction:add" | "reaction:remove",
  payload: {
    channelId: string;
    messageId: string;
    userId: string;
    emoji: string;
  },
): void {
  currentSocketServer()
    ?.to(channelRoom(payload.channelId))
    .emit(event, payload);
}

export function emitTypingStart(payload: {
  channelId: string;
  userId: string;
}): void {
  currentSocketServer()
    ?.to(channelRoom(payload.channelId))
    .emit("typing:start", payload);
}

export function emitReadUpdate(
  userId: string,
  payload: {
    channelId: string;
    lastReadMessageId: string;
    mentionCount: number;
  },
): void {
  currentSocketServer()?.to(userRoom(userId)).emit("read:update", payload);
}

export function emitPermissionsChanged(serverId: string): void {
  currentSocketServer()
    ?.to(serverRoom(serverId))
    .emit("permissions:changed", { serverId });
}

export function emitChannelEvent(
  event: "channel:create" | "channel:update" | "channel:delete",
  serverId: string,
  channelId: string,
): void {
  currentSocketServer()
    ?.to(serverRoom(serverId))
    .emit(event, { serverId, channelId });
}

export function emitServerEvent(
  event: "server:update" | "server:delete",
  serverId: string,
): void {
  currentSocketServer()?.to(serverRoom(serverId)).emit(event, { serverId });
}

export function emitMemberEvent(
  event: "member:join" | "member:leave",
  serverId: string,
  userId: string,
): void {
  currentSocketServer()
    ?.to([serverRoom(serverId), userRoom(userId)])
    .emit(event, { serverId, userId });
}

export async function emitUserUpdate(userId: string): Promise<void> {
  const io = currentSocketServer();

  if (io === null) {
    return;
  }

  try {
    const rooms = await listUserAudienceRooms(userId);

    io.to([...rooms, userRoom(userId)]).emit("user:update", { userId });
  } catch (error) {
    logger.error({ err: error, userId }, "Announcing a profile change failed");
  }
}

export function emitRoleUpdate(serverId: string): void {
  currentSocketServer()
    ?.to(serverRoom(serverId))
    .emit("role:update", { serverId });
}
