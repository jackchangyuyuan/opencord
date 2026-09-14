import { createServer } from "node:http";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import type { PresenceStatus } from "@opencord/shared/types";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { serverMembers } from "../../src/db/schema/index.js";
import { redis } from "../../src/redis.js";
import { createSocketServer } from "../../src/socket/index.js";
import {
  claimStaleConnection,
  readAggregate,
  readConnections,
  SEEN_KEY,
  SWEEP_AFTER_MS,
  sweepPresence,
} from "../../src/socket/presence.js";
import type { SocketServer } from "../../src/socket/types.js";
import { type Account, cookieHeader, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Instance {
  io: SocketServer;
  origin: string;
}

const SETTLE_TIMEOUT_MS = 3000;
const SETTLE_POLL_MS = 25;

const serverBody = z.object({ id: z.string() });

async function startInstance(): Promise<Instance> {
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const address = httpServer.address();

  if (address === null || typeof address === "string") {
    throw new Error("Expected the server to listen on a TCP port");
  }

  return { io, origin: `http://127.0.0.1:${String(address.port)}` };
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function settle(
  userId: string,
  expected: PresenceStatus,
): Promise<PresenceStatus> {
  const deadline = Date.now() + SETTLE_TIMEOUT_MS;

  for (;;) {
    const status = await readAggregate(userId);

    if (status === expected || Date.now() > deadline) {
      return status;
    }

    await sleep(SETTLE_POLL_MS);
  }
}

describe("presence aggregation across instances", () => {
  let one: Instance;
  let two: Instance;
  const clients: Client[] = [];

  beforeAll(() => {
    requireTestDatabase();
  });

  beforeEach(async () => {
    [one, two] = await Promise.all([startInstance(), startInstance()]);
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.close();
    }

    await Promise.all([one.io.close(), two.io.close()]);
  });

  async function open(instance: Instance, account: Account): Promise<Client> {
    const client: Client = connect(instance.origin, {
      autoConnect: false,
      extraHeaders: { cookie: cookieHeader(account.cookies) },
      reconnection: false,
      transports: ["websocket"],
    });

    clients.push(client);

    const greeted = new Promise<void>((resolve) => {
      client.once("connection:ready", () => {
        resolve();
      });
    });

    client.connect();

    await greeted;

    return client;
  }

  it("holds one hash field per live socket", async () => {
    const ada = await signUp("ada");

    await open(one, ada);
    await open(two, ada);

    expect(await settle(ada.id, "online")).toBe("online");
    expect(await readConnections(ada.id)).toHaveLength(2);
  });

  it("walks online → idle → offline and back to dnd", async () => {
    const ada = await signUp("ada");

    const first = await open(one, ada);
    const second = await open(two, ada);

    expect(await settle(ada.id, "online")).toBe("online");

    first.emit("presence:heartbeat", { status: "online", idle: true });

    await sleep(SETTLE_POLL_MS);

    expect(await readAggregate(ada.id)).toBe("online");

    second.emit("presence:heartbeat", { status: "online", idle: true });

    expect(await settle(ada.id, "idle")).toBe("idle");

    second.emit("presence:heartbeat", { status: "dnd", idle: true });

    expect(await settle(ada.id, "dnd")).toBe("dnd");

    first.close();
    second.close();

    expect(await settle(ada.id, "offline")).toBe("offline");
    expect(await readConnections(ada.id)).toEqual([]);
  });

  it("broadcasts only to servers the user shares, and only on a transition", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    const created = await request(app)
      .post("/api/v1/servers")
      .set("Cookie", ada.cookies)
      .send({ name: "Analytical Engine" });

    const serverId = serverBody.parse(created.body).id;

    await db.insert(serverMembers).values({ serverId, userId: grace.id });

    const watcher = await open(one, grace);

    const seen: { userId: string; status: PresenceStatus }[] = [];

    watcher.on("presence:update", (payload) => {
      seen.push(payload);
    });

    const adaClient = await open(two, ada);

    await settle(ada.id, "online");
    await sleep(SETTLE_POLL_MS * 4);

    adaClient.emit("presence:heartbeat", { status: "online", idle: false });

    await sleep(SETTLE_POLL_MS * 4);

    expect(seen.filter((event) => event.userId === ada.id)).toEqual([
      { userId: ada.id, status: "online" },
    ]);

    adaClient.close();

    await settle(ada.id, "offline");
    await sleep(SETTLE_POLL_MS * 4);

    expect(seen.filter((event) => event.userId === ada.id)).toEqual([
      { userId: ada.id, status: "online" },
      { userId: ada.id, status: "offline" },
    ]);
  });

  it("broadcasts to a direct-message counterpart who shares no server", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    const opened = await request(app)
      .post("/api/v1/dms")
      .set("Cookie", ada.cookies)
      .send({ recipientId: grace.id });

    expect(opened.status).toBe(201);

    const watcher = await open(one, grace);
    const seen: { userId: string; status: PresenceStatus }[] = [];

    watcher.on("presence:update", (payload) => {
      seen.push(payload);
    });

    const adaClient = await open(two, ada);

    await settle(ada.id, "online");
    await sleep(SETTLE_POLL_MS * 4);

    expect(seen.filter((event) => event.userId === ada.id)).toEqual([
      { userId: ada.id, status: "online" },
    ]);

    adaClient.close();
  });

  it("tells a joining socket about a counterpart already online", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    await request(app)
      .post("/api/v1/dms")
      .set("Cookie", ada.cookies)
      .send({ recipientId: grace.id });

    const early = await open(one, ada);

    early.emit("presence:heartbeat", { status: "dnd", idle: false });

    await settle(ada.id, "dnd");

    const later: Client = connect(two.origin, {
      autoConnect: false,
      extraHeaders: { cookie: cookieHeader(grace.cookies) },
      reconnection: false,
      transports: ["websocket"],
    });

    clients.push(later);

    const snapshot = new Promise<{ userId: string; status: PresenceStatus }>(
      (resolve) => {
        later.on("presence:update", resolve);
      },
    );

    later.connect();

    expect(await snapshot).toEqual({ userId: ada.id, status: "dnd" });
  });

  it("announces a profile edit to the servers and the conversations", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    await request(app)
      .post("/api/v1/dms")
      .set("Cookie", ada.cookies)
      .send({ recipientId: grace.id });

    const watcher = await open(one, grace);
    const own = await open(two, ada);

    const seen: { userId: string }[] = [];
    const ownTab: { userId: string }[] = [];

    watcher.on("user:update", (payload) => {
      seen.push(payload);
    });

    own.on("user:update", (payload) => {
      ownTab.push(payload);
    });

    const saved = await request(app)
      .patch("/api/v1/users/@me")
      .set("Cookie", ada.cookies)
      .send({ customStatus: "shipping bugs" });

    expect(saved.status).toBe(200);

    await sleep(SETTLE_POLL_MS * 8);

    expect(seen).toEqual([{ userId: ada.id }]);
    expect(ownTab).toEqual([{ userId: ada.id }]);
  });

  it("keeps a profile edit away from a stranger", async () => {
    const ada = await signUp("ada");
    const alan = await signUp("alan");

    const stranger = await open(one, alan);
    const seen: { userId: string }[] = [];

    stranger.on("user:update", (payload) => {
      seen.push(payload);
    });

    await open(two, ada);

    await request(app)
      .patch("/api/v1/users/@me")
      .set("Cookie", ada.cookies)
      .send({ description: "nobody else should hear this" });

    await sleep(SETTLE_POLL_MS * 8);

    expect(seen).toEqual([]);
  });

  it("drops a malformed heartbeat without touching the hash", async () => {
    const ada = await signUp("ada");

    const client = await open(one, ada);

    await settle(ada.id, "online");

    client.emit("presence:heartbeat", {
      status: "sleepy",
      idle: "yes",
    } as never);

    await sleep(SETTLE_POLL_MS * 4);

    const connections = await readConnections(ada.id);

    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ status: "online", idle: false });
  });

  it("sweeps a connection no disconnect ever reported", async () => {
    const ada = await signUp("ada");

    await open(one, ada);

    expect(await settle(ada.id, "online")).toBe("online");

    await sweepPresence(one.io, Date.now() + SWEEP_AFTER_MS + 1000);

    expect(await readConnections(ada.id)).toEqual([]);
    expect(await readAggregate(ada.id)).toBe("offline");
  });

  it("refuses to sweep a connection whose heartbeat landed after the scan", async () => {
    const ada = await signUp("ada");

    const client = await open(one, ada);

    expect(await settle(ada.id, "online")).toBe("online");

    const socketId = client.id ?? "";
    const member = `${ada.id}:${socketId}`;
    const staleAt = Date.now() - SWEEP_AFTER_MS - 10_000;

    await redis.zadd(SEEN_KEY, staleAt, member);

    const cutoffMs = Date.now() - SWEEP_AFTER_MS;

    await redis.zadd(SEEN_KEY, Date.now(), member);

    expect(await claimStaleConnection(ada.id, socketId, cutoffMs)).toBe(false);
    expect(await readConnections(ada.id)).toHaveLength(1);
    expect(await readAggregate(ada.id)).toBe("online");
  });

  it("claims a genuinely stale connection exactly once", async () => {
    const ada = await signUp("ada");

    const client = await open(one, ada);

    expect(await settle(ada.id, "online")).toBe("online");

    const socketId = client.id ?? "";
    const member = `${ada.id}:${socketId}`;
    const staleAt = Date.now() - SWEEP_AFTER_MS - 10_000;

    await redis.zadd(SEEN_KEY, staleAt, member);

    const cutoffMs = Date.now() - SWEEP_AFTER_MS;

    const [first, second] = await Promise.all([
      claimStaleConnection(ada.id, socketId, cutoffMs),
      claimStaleConnection(ada.id, socketId, cutoffMs),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(await readConnections(ada.id)).toEqual([]);
  });

  it("tells a joining socket who is already online", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    const created = await request(app)
      .post("/api/v1/servers")
      .set("Cookie", ada.cookies)
      .send({ name: "Analytical Engine" });

    const serverId = serverBody.parse(created.body).id;

    await db.insert(serverMembers).values({ serverId, userId: grace.id });

    const early = await open(one, ada);

    early.emit("presence:heartbeat", { status: "dnd", idle: false });

    expect(await settle(ada.id, "dnd")).toBe("dnd");

    const seen: { userId: string; status: PresenceStatus }[] = [];

    const late: Client = connect(two.origin, {
      autoConnect: false,
      extraHeaders: { cookie: cookieHeader(grace.cookies) },
      reconnection: false,
      transports: ["websocket"],
    });

    clients.push(late);

    late.on("presence:update", (payload) => {
      seen.push(payload);
    });

    const greeted = new Promise<void>((resolve) => {
      late.once("connection:ready", () => {
        resolve();
      });
    });

    late.connect();

    await greeted;

    const deadline = Date.now() + SETTLE_TIMEOUT_MS;

    while (
      !seen.some((entry) => entry.userId === ada.id) &&
      Date.now() < deadline
    ) {
      await sleep(SETTLE_POLL_MS);
    }

    expect(seen).toContainEqual({ userId: ada.id, status: "dnd" });
  });

  it("leaves a fresh connection alone when the sweeper runs", async () => {
    const ada = await signUp("ada");

    await open(one, ada);
    await settle(ada.id, "online");

    await sweepPresence(one.io);

    expect(await readConnections(ada.id)).toHaveLength(1);
  });
});
