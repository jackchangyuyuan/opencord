import { eq } from "drizzle-orm";

import { resolveAccessibleChannels } from "../access/channels.js";
import { db } from "../db/index.js";
import { serverMembers } from "../db/schema/index.js";
import type { AppSocket } from "./types.js";

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

export async function resolveRooms(
  userId: string,
  sessionId: string,
): Promise<string[]> {
  const memberships = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(eq(serverMembers.userId, userId));

  const accessible = await resolveAccessibleChannels(userId);

  return [
    userRoom(userId),
    sessionRoom(sessionId),
    ...memberships.map((membership) => serverRoom(membership.serverId)),
    ...[...accessible].map(channelRoom),
  ];
}

export async function joinRooms(socket: AppSocket): Promise<void> {
  const rooms = await resolveRooms(socket.data.user.id, socket.data.sessionId);

  await socket.join(rooms);
}
