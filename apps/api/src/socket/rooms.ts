import { and, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import { resolveAccessibleChannelsByUser } from "../access/channels.js";
import { db } from "../db/index.js";
import { channelMembers } from "../db/schema/index.js";
import { logger } from "../lib/logger.js";
import {
  listMemberServerIds,
  listMembershipsOf,
  listServerPeerIds,
} from "../modules/members/queries.js";
import { currentSocketServer } from "./registry.js";
import type { AppSocket, RoomSyncRequest, SocketServer } from "./types.js";

export function channelRoom(channelId: string): string {
  return `channel:${channelId}`;
}

export function serverRoom(serverId: string): string {
  return `server:${serverId}`;
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

const DERIVED_PREFIXES = ["user:", "server:", "channel:"];

async function listDmCounterpartIds(userId: string): Promise<string[]> {
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
  const [serverIds, counterparts] = await Promise.all([
    listMemberServerIds(userId),
    listDmCounterpartIds(userId),
  ]);

  return [
    ...new Set([...serverIds.map(serverRoom), ...counterparts.map(userRoom)]),
  ];
}

export async function listPresencePeerIds(userId: string): Promise<string[]> {
  const [peers, counterparts] = await Promise.all([
    listServerPeerIds(userId),
    listDmCounterpartIds(userId),
  ]);

  return [...new Set([...peers, ...counterparts])];
}

async function resolveMembershipRoomsByUser(
  userIds: readonly string[],
): Promise<Map<string, string[]>> {
  const unique = [...new Set(userIds)];
  const rooms = new Map<string, string[]>();

  if (unique.length === 0) {
    return rooms;
  }

  const memberships = await listMembershipsOf(unique);
  const accessible = await resolveAccessibleChannelsByUser(unique);

  const servers = new Map<string, string[]>();

  for (const membership of memberships) {
    const held = servers.get(membership.userId) ?? [];

    held.push(serverRoom(membership.serverId));
    servers.set(membership.userId, held);
  }

  for (const userId of unique) {
    rooms.set(userId, [
      userRoom(userId),
      ...(servers.get(userId) ?? []),
      ...[...(accessible.get(userId) ?? [])].map(channelRoom),
    ]);
  }

  return rooms;
}

const CONVERGE_ATTEMPTS = 3;

function isDerived(room: string): boolean {
  return DERIVED_PREFIXES.some((prefix) => room.startsWith(prefix));
}

async function apply(
  sockets: readonly AppSocket[],
  wanted: Map<string, string[]>,
): Promise<boolean> {
  let wrote = false;

  for (const socket of sockets) {
    const rooms = wanted.get(socket.data.user.id);

    if (rooms === undefined) {
      continue;
    }

    const held = new Set(rooms);
    const leaving = [...socket.rooms].filter(
      (room) => isDerived(room) && !held.has(room),
    );
    const joining = rooms.filter((room) => !socket.rooms.has(room));

    if (leaving.length === 0 && joining.length === 0) {
      continue;
    }

    wrote = true;

    for (const room of leaving) {
      await socket.leave(room);
    }

    if (joining.length > 0) {
      await socket.join(joining);
    }
  }

  return wrote;
}

const chains = new Map<string, Promise<void>>();

async function withUserChains<T>(
  userIds: readonly string[],
  work: () => Promise<T>,
): Promise<T> {
  let release!: () => void;

  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  const predecessors: Promise<void>[] = [];
  const tails = new Map<string, Promise<void>>();

  for (const userId of userIds) {
    const previous = chains.get(userId) ?? Promise.resolve();
    const tail = previous.then(() => held);

    chains.set(userId, tail);
    tails.set(userId, tail);
    predecessors.push(previous);
  }

  await Promise.all(predecessors);

  try {
    return await work();
  } finally {
    release();

    for (const [userId, tail] of tails) {
      if (chains.get(userId) === tail) {
        chains.delete(userId);
      }
    }
  }
}

async function converge(sockets: readonly AppSocket[]): Promise<void> {
  const userIds = [...new Set(sockets.map((socket) => socket.data.user.id))];

  if (userIds.length === 0) {
    return;
  }

  await withUserChains(userIds, async () => {
    for (let attempt = 0; attempt < CONVERGE_ATTEMPTS; attempt += 1) {
      const wanted = await resolveMembershipRoomsByUser(userIds);

      const live = sockets.filter((socket) => socket.connected);

      if (!(await apply(live, wanted))) {
        return;
      }
    }

    logger.warn(
      { userIds },
      "Room synchronisation did not settle; leaving it to the periodic reconciliation",
    );
  });
}

function localSockets(io: SocketServer): AppSocket[] {
  return [...io.of("/").sockets.values()];
}

function selectedSockets(
  io: SocketServer,
  request: RoomSyncRequest,
): AppSocket[] {
  if (request.scope === "users") {
    const wanted = new Set(request.userIds);

    return localSockets(io).filter((socket) => wanted.has(socket.data.user.id));
  }

  const room = serverRoom(request.serverId);

  return localSockets(io).filter((socket) => socket.rooms.has(room));
}

const roomSyncRequestSchema: z.ZodType<RoomSyncRequest> = z.discriminatedUnion(
  "scope",
  [
    z.object({ scope: z.literal("users"), userIds: z.array(z.string()) }),
    z.object({ scope: z.literal("server"), serverId: z.string() }),
  ],
);

export async function joinRooms(socket: AppSocket): Promise<void> {
  await socket.join([
    userRoom(socket.data.user.id),
    sessionRoom(socket.data.sessionId),
  ]);

  await converge([socket]);
}

export async function reconcileLocalRooms(io: SocketServer): Promise<void> {
  await converge(localSockets(io));
}

export function listenForPeerRoomSync(io: SocketServer): void {
  const apply = async (request: RoomSyncRequest): Promise<boolean> => {
    const parsed = roomSyncRequestSchema.safeParse(request);

    if (!parsed.success) {
      logger.warn({ request }, "Ignoring an unreadable room sync request");

      return false;
    }

    try {
      await converge(selectedSockets(io, parsed.data));

      return true;
    } catch (error) {
      logger.error({ err: error }, "Peer room synchronisation failed");

      return false;
    }
  };

  io.on("rooms:sync", (request) => {
    void apply(request);
  });

  io.on("rooms:revoke", (request, applied) => {
    void apply(request).then(applied);
  });
}

function affectedRooms(request: RoomSyncRequest): string[] {
  return request.scope === "users"
    ? request.userIds.map(userRoom)
    : [serverRoom(request.serverId)];
}

async function convergeLocally(
  io: SocketServer,
  request: RoomSyncRequest,
): Promise<boolean> {
  try {
    await converge(selectedSockets(io, request));

    return true;
  } catch (error) {
    logger.error({ err: error, request }, "Room synchronisation failed");

    return false;
  }
}

async function confirmPeers(
  io: SocketServer,
  request: RoomSyncRequest,
): Promise<boolean> {
  try {
    const answers = await io.serverSideEmitWithAck("rooms:revoke", request);

    return answers.every((converged) => converged);
  } catch (error) {
    logger.error(
      { err: error, request },
      "Peers did not confirm a room synchronisation",
    );

    return false;
  }
}

async function sync(request: RoomSyncRequest): Promise<void> {
  const io = currentSocketServer();

  if (io === null) {
    return;
  }

  io.serverSideEmit("rooms:sync", request);

  await convergeLocally(io, request);
}

async function revoke(request: RoomSyncRequest): Promise<void> {
  const io = currentSocketServer();

  if (io === null) {
    return;
  }

  const [peers, local] = await Promise.all([
    confirmPeers(io, request),
    convergeLocally(io, request),
  ]);

  if (peers && local) {
    return;
  }

  logger.error(
    { request, peers, local },
    "Closing the sockets of a revocation the cluster did not confirm",
  );

  if (currentSocketServer() !== io) {
    return;
  }

  io.in(affectedRooms(request)).disconnectSockets(true);
}

function usersRequest(userIds: readonly string[]): RoomSyncRequest | null {
  const unique = [...new Set(userIds)];

  return unique.length === 0 ? null : { scope: "users", userIds: unique };
}

export async function syncUserRooms(userIds: readonly string[]): Promise<void> {
  const request = usersRequest(userIds);

  if (request !== null) {
    await sync(request);
  }
}

export async function revokeUserRooms(
  userIds: readonly string[],
): Promise<void> {
  const request = usersRequest(userIds);

  if (request !== null) {
    await revoke(request);
  }
}

export async function syncServerRooms(serverId: string): Promise<void> {
  await sync({ scope: "server", serverId });
}

export async function revokeServerRooms(serverId: string): Promise<void> {
  await revoke({ scope: "server", serverId });
}

export function revokeUserEverywhere(userId: string): void {
  const io = currentSocketServer();
  const room = userRoom(userId);

  io?.to(room).emit("session:revoked");
  io?.in(room).disconnectSockets(true);
}

export function revokeSessionEverywhere(sessionId: string): void {
  const io = currentSocketServer();
  const room = sessionRoom(sessionId);

  io?.to(room).emit("session:revoked");
  io?.in(room).disconnectSockets(true);
}
