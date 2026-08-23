import type { PresenceStatus } from "@opencord/shared/types";

import { config } from "../config.js";
import { redis } from "../redis.js";
import { listServerPeerIds, listServerRoomsFor } from "./rooms.js";
import type { AppSocket, SocketServer } from "./types.js";

export const SWEEP_AFTER_MS = 90_000;
export const SWEEP_INTERVAL_MS = 30_000;

const SEEN_KEY = "presence:seen";

const CLAIM_STALE_CONNECTION = `
local score = redis.call('zscore', KEYS[1], ARGV[1])
if not score then return 0 end
if tonumber(score) > tonumber(ARGV[3]) then return 0 end
redis.call('zrem', KEYS[1], ARGV[1])
redis.call('hdel', KEYS[2], ARGV[2])
return 1
`;

export interface Connection {
  status: PresenceStatus;
  idle: boolean;
  lastSeenMs: number;
  instanceId: string;
}

export function aggregate(connections: readonly Connection[]): PresenceStatus {
  if (connections.length === 0) {
    return "offline";
  }

  if (connections.some((connection) => connection.status === "dnd")) {
    return "dnd";
  }

  if (connections.some((connection) => !connection.idle)) {
    return "online";
  }

  return "idle";
}

function connectionsKey(userId: string): string {
  return `presence:conns:${userId}`;
}

function seenMember(userId: string, socketId: string): string {
  return `${userId}:${socketId}`;
}

function parseConnection(raw: string): Connection | null {
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const { status, idle, lastSeenMs, instanceId } = parsed as Record<
    string,
    unknown
  >;

  if (
    typeof status !== "string" ||
    typeof idle !== "boolean" ||
    typeof lastSeenMs !== "number" ||
    typeof instanceId !== "string"
  ) {
    return null;
  }

  return {
    status: status as PresenceStatus,
    idle,
    lastSeenMs,
    instanceId,
  };
}

function parseConnections(stored: unknown): Connection[] {
  if (typeof stored !== "object" || stored === null) {
    return [];
  }

  return Object.values(stored)
    .filter((raw): raw is string => typeof raw === "string")
    .map(parseConnection)
    .filter((connection): connection is Connection => connection !== null);
}

export async function readConnections(userId: string): Promise<Connection[]> {
  return parseConnections(await redis.hgetall(connectionsKey(userId)));
}

export function readAggregate(userId: string): Promise<PresenceStatus> {
  return readConnections(userId).then(aggregate);
}

async function announce(
  io: SocketServer,
  userId: string,
  before: PresenceStatus,
): Promise<void> {
  const after = await readAggregate(userId);

  if (after === before) {
    return;
  }

  const rooms = await listServerRoomsFor(userId);

  if (rooms.length === 0) {
    return;
  }

  io.to(rooms).emit("presence:update", { userId, status: after });
}

export async function recordHeartbeat(
  io: SocketServer,
  socket: AppSocket,
  input: { status: PresenceStatus; idle: boolean },
): Promise<void> {
  const userId = socket.data.user.id;
  const before = await readAggregate(userId);
  const now = Date.now();

  const connection: Connection = {
    status: input.status,
    idle: input.idle,
    lastSeenMs: now,
    instanceId: config.INSTANCE_ID,
  };

  await redis
    .multi()
    .hset(connectionsKey(userId), socket.id, JSON.stringify(connection))
    .zadd(SEEN_KEY, now, seenMember(userId, socket.id))
    .exec();

  await announce(io, userId, before);
}

export async function dropConnection(
  io: SocketServer,
  userId: string,
  socketId: string,
): Promise<void> {
  const before = await readAggregate(userId);

  await redis
    .multi()
    .hdel(connectionsKey(userId), socketId)
    .zrem(SEEN_KEY, seenMember(userId, socketId))
    .exec();

  await announce(io, userId, before);
}

export async function claimStaleConnection(
  userId: string,
  socketId: string,
  cutoffMs: number,
): Promise<boolean> {
  const claimed: unknown = await redis.eval(
    CLAIM_STALE_CONNECTION,
    2,
    SEEN_KEY,
    connectionsKey(userId),
    seenMember(userId, socketId),
    socketId,
    String(cutoffMs),
  );

  return claimed === 1;
}

export async function sweepPresence(
  io: SocketServer,
  now = Date.now(),
): Promise<void> {
  const cutoffMs = now - SWEEP_AFTER_MS;
  const stale = await redis.zrangebyscore(SEEN_KEY, "-inf", cutoffMs);

  for (const member of stale) {
    const separator = member.lastIndexOf(":");
    const userId = member.slice(0, separator);
    const socketId = member.slice(separator + 1);
    const before = await readAggregate(userId);

    if (!(await claimStaleConnection(userId, socketId, cutoffMs))) {
      continue;
    }

    await announce(io, userId, before);
  }
}

export async function sendPresenceSnapshot(socket: AppSocket): Promise<void> {
  const peers = await listServerPeerIds(socket.data.user.id);

  if (peers.length === 0) {
    return;
  }

  const pipeline = redis.pipeline();

  for (const peer of peers) {
    pipeline.hgetall(connectionsKey(peer));
  }

  const results = await pipeline.exec();

  if (results === null) {
    return;
  }

  peers.forEach((userId, index) => {
    const result = results[index];

    if (result?.[0] !== null) {
      return;
    }

    const status = aggregate(parseConnections(result[1]));

    if (status === "offline") {
      return;
    }

    socket.emit("presence:update", { userId, status });
  });
}
