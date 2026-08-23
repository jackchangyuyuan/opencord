import { eq } from "drizzle-orm";

import { resolveAccessibleChannels } from "../access/channels.js";
import { db } from "../db/index.js";
import { serverMembers } from "../db/schema/index.js";
import type { AppSocket, SocketServer } from "./types.js";

export function channelRoom(channelId: string): string {
  return `channel:${channelId}`;
}

export function serverRoom(serverId: string): string {
  return `server:${serverId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

const DERIVED_PREFIXES = ["user:", "server:", "channel:"];

export async function listServerMemberIds(serverId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: serverMembers.userId })
    .from(serverMembers)
    .where(eq(serverMembers.serverId, serverId));

  return rows.map((row) => row.userId);
}

export async function resolveMembershipRooms(
  userId: string,
): Promise<string[]> {
  const memberships = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(eq(serverMembers.userId, userId));

  const accessible = await resolveAccessibleChannels(userId);

  return [
    userRoom(userId),
    ...memberships.map((membership) => serverRoom(membership.serverId)),
    ...[...accessible].map(channelRoom),
  ];
}

export async function joinRooms(socket: AppSocket): Promise<void> {
  const rooms = await resolveMembershipRooms(socket.data.user.id);

  await socket.join([...rooms, sessionRoom(socket.data.sessionId)]);
}

export function joinServerRooms(
  io: SocketServer,
  userId: string,
  serverId: string,
  channelIds: readonly string[],
): void {
  io.in(userRoom(userId)).socketsJoin([
    serverRoom(serverId),
    ...channelIds.map(channelRoom),
  ]);
}

export async function rederiveRooms(
  io: SocketServer,
  userIds: readonly string[],
): Promise<void> {
  for (const userId of new Set(userIds)) {
    const sockets = await io.in(userRoom(userId)).fetchSockets();

    if (sockets.length === 0) {
      continue;
    }

    const next = await resolveMembershipRooms(userId);
    const wanted = new Set(next);

    for (const socket of sockets) {
      const derived = [...socket.rooms].filter((room) =>
        DERIVED_PREFIXES.some((prefix) => room.startsWith(prefix)),
      );

      const leaving = derived.filter((room) => !wanted.has(room));
      const joining = next.filter((room) => !socket.rooms.has(room));

      if (leaving.length > 0) {
        io.in(socket.id).socketsLeave(leaving);
      }

      if (joining.length > 0) {
        io.in(socket.id).socketsJoin(joining);
      }
    }
  }
}

export function revokeSession(io: SocketServer, sessionId: string): void {
  const room = sessionRoom(sessionId);

  io.to(room).emit("session:revoked");
  io.in(room).disconnectSockets(true);
}
