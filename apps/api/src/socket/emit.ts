import type { Message } from "@opencord/shared/types";

import {
  channelRoom,
  disconnectUser,
  joinServerRooms,
  listServerMemberIds,
  listViewableChannelRooms,
  rederiveRooms,
  revokeSession,
  serverRoom,
  userRoom,
} from "./rooms.js";
import type { SocketServer } from "./types.js";

let current: SocketServer | null = null;

export function registerSocketServer(io: SocketServer): void {
  current = io;
}

export function unregisterSocketServer(io: SocketServer): void {
  if (current === io) {
    current = null;
  }
}

export function countLocalSockets(): number {
  return current === null ? 0 : current.of("/").sockets.size;
}

export function emitMessageCreate(message: Message): void {
  current?.to(channelRoom(message.channelId)).emit("message:create", {
    message,
  });
}

export function emitMessageUpdate(message: Message): void {
  current?.to(channelRoom(message.channelId)).emit("message:update", {
    message,
  });
}

export function emitMessageDelete(payload: {
  channelId: string;
  messageId: string;
  deletedAt: string;
}): void {
  current?.to(channelRoom(payload.channelId)).emit("message:delete", payload);
}

export function emitMessagePin(payload: {
  channelId: string;
  messageId: string;
  pinnedAt: string | null;
  pinnedBy: string | null;
}): void {
  current?.to(channelRoom(payload.channelId)).emit("message:pin", payload);
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
  current?.to(channelRoom(payload.channelId)).emit(event, payload);
}

export function emitReadUpdate(
  userId: string,
  payload: {
    channelId: string;
    lastReadMessageId: string;
    mentionCount: number;
  },
): void {
  current?.to(userRoom(userId)).emit("read:update", payload);
}

export function emitPermissionsChanged(serverId: string): void {
  current?.to(serverRoom(serverId)).emit("permissions:changed", { serverId });
}

export function emitChannelEvent(
  event: "channel:create" | "channel:update" | "channel:delete",
  serverId: string,
  channelId: string,
): void {
  current?.to(serverRoom(serverId)).emit(event, { serverId, channelId });
}

export function emitServerEvent(
  event: "server:update" | "server:delete",
  serverId: string,
): void {
  current?.to(serverRoom(serverId)).emit(event, { serverId });
}

export function emitMemberEvent(
  event: "member:join" | "member:leave",
  serverId: string,
  userId: string,
): void {
  current?.to(serverRoom(serverId)).emit(event, { serverId, userId });
}

export function emitRoleUpdate(serverId: string): void {
  current?.to(serverRoom(serverId)).emit("role:update", { serverId });
}

export async function rederiveRoomsFor(
  userIds: readonly string[],
): Promise<void> {
  if (current === null) {
    return;
  }

  await rederiveRooms(current, userIds);
}

export async function joinRedeemedServerRooms(
  userId: string,
  serverId: string,
): Promise<void> {
  if (current === null) {
    return;
  }

  const rooms = await listViewableChannelRooms(userId, serverId);

  current.in(userRoom(userId)).socketsJoin([serverRoom(serverId), ...rooms]);
}

export function joinCreatedServerRooms(
  userId: string,
  serverId: string,
  channelIds: readonly string[],
): void {
  if (current === null) {
    return;
  }

  joinServerRooms(current, userId, serverId, channelIds);
}

export function serverMemberIds(serverId: string): Promise<string[]> {
  return listServerMemberIds(serverId);
}

export async function disconnectMemberSockets(userId: string): Promise<void> {
  if (current === null) {
    return;
  }

  disconnectUser(current, userId);

  await Promise.resolve();
}

export function revokeSessionEverywhere(sessionId: string): void {
  if (current === null) {
    return;
  }

  revokeSession(current, sessionId);
}
