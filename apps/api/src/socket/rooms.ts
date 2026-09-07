import { and, eq, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { resolveAccessibleChannels } from "../access/channels.js";
import { db } from "../db/index.js";
import { channelMembers, channels, serverMembers } from "../db/schema/index.js";
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

async function listServerRoomsFor(userId: string): Promise<string[]> {
  const memberships = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(eq(serverMembers.userId, userId));

  return memberships.map((membership) => serverRoom(membership.serverId));
}

async function listServerPeerIds(userId: string): Promise<string[]> {
  const memberships = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(eq(serverMembers.userId, userId));

  const serverIds = memberships.map((membership) => membership.serverId);

  if (serverIds.length === 0) {
    return [];
  }

  const rows = await db
    .selectDistinct({ userId: serverMembers.userId })
    .from(serverMembers)
    .where(
      and(
        inArray(serverMembers.serverId, serverIds),
        ne(serverMembers.userId, userId),
      ),
    );

  return rows.map((row) => row.userId);
}

export async function listDmCounterpartIds(userId: string): Promise<string[]> {
  const mine = alias(channelMembers, "mine");
  const theirs = alias(channelMembers, "theirs");

  const rows = await db
    .selectDistinct({ userId: theirs.userId })
    .from(mine)
    .innerJoin(
      theirs,
      and(eq(theirs.channelId, mine.channelId), ne(theirs.userId, mine.userId)),
    )
    .where(eq(mine.userId, userId));

  return rows.map((row) => row.userId);
}

export async function listUserAudienceRooms(userId: string): Promise<string[]> {
  const [servers, counterparts] = await Promise.all([
    listServerRoomsFor(userId),
    listDmCounterpartIds(userId),
  ]);

  return [...new Set([...servers, ...counterparts.map(userRoom)])];
}

export async function listPresencePeerIds(userId: string): Promise<string[]> {
  const [peers, counterparts] = await Promise.all([
    listServerPeerIds(userId),
    listDmCounterpartIds(userId),
  ]);

  return [...new Set([...peers, ...counterparts])];
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

export async function listViewableChannelRooms(
  userId: string,
  serverId: string,
): Promise<string[]> {
  const accessible = await resolveAccessibleChannels(userId);

  const rows = await db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.serverId, serverId));

  return rows
    .filter((row) => accessible.has(row.id))
    .map((row) => channelRoom(row.id));
}

export function disconnectUser(io: SocketServer, userId: string): void {
  io.in(userRoom(userId)).disconnectSockets(true);
}

export function revokeUser(io: SocketServer, userId: string): void {
  const room = userRoom(userId);

  io.to(room).emit("session:revoked");
  io.in(room).disconnectSockets(true);
}

export function revokeSession(io: SocketServer, sessionId: string): void {
  const room = sessionRoom(sessionId);

  io.to(room).emit("session:revoked");
  io.in(room).disconnectSockets(true);
}
