import { createServer } from "node:http";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import { Permissions } from "@opencord/shared/permissions";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { z } from "zod";

import { type Account, cookieHeader, signUp } from "../helpers/accounts.js";

const namespace = vi.hoisted(() => {
  const value = `rl-typing-${Math.random().toString(36).slice(2)}`;

  process.env["RATE_LIMIT_NAMESPACE"] = value;
  process.env["RATE_LIMIT_TYPING_POINTS"] = "2";

  return value;
});

const { app } = await import("../../src/app.js");
const { db } = await import("../../src/db/index.js");
const { redis } = await import("../../src/redis.js");
const { channelMemberOverwrites, serverMembers } =
  await import("../../src/db/schema/index.js");
const { createSocketServer } = await import("../../src/socket/index.js");
const { requireTestDatabase } = await import("../setup.js");

type SocketServer = ReturnType<typeof createSocketServer>;
type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Instance {
  io: SocketServer;
  origin: string;
}

const SETTLE_MS = 300;

const serverBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string() }));

async function createServerWithChannel(
  account: Account,
  name: string,
): Promise<{ serverId: string; channelId: string }> {
  const created = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", account.cookies)
    .send({ name });

  const serverId = serverBody.parse(created.body).id;

  const listed = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", account.cookies);

  const [channel] = channelList.parse(listed.body);

  if (channel === undefined) {
    throw new Error("the fixture is incomplete");
  }

  return { serverId, channelId: channel.id };
}

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

describe("typing indicators pass all three gates (S-9, SPEC 8.4)", () => {
  let instance: Instance;
  const clients: Client[] = [];

  beforeAll(() => {
    requireTestDatabase();
  });

  beforeEach(async () => {
    instance = await startInstance();
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.close();
    }

    await instance.io.close();
  });

  async function open(account: Account): Promise<Client> {
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

  function watch(client: Client): { channelId: string; userId: string }[] {
    const seen: { channelId: string; userId: string }[] = [];

    client.on("typing:start", (payload) => {
      seen.push(payload);
    });

    return seen;
  }

  it("relays a typing indicator to the channel room, never to the sender", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const fixture = await createServerWithChannel(ada, "Analytical Engine");

    await db
      .insert(serverMembers)
      .values({ serverId: fixture.serverId, userId: grace.id });

    const watcher = await open(grace);
    const author = await open(ada);

    const seen = watch(watcher);
    const echoed = watch(author);

    author.emit("typing:start", { channelId: fixture.channelId });

    await sleep(SETTLE_MS);

    expect(seen).toEqual([{ channelId: fixture.channelId, userId: ada.id }]);
    expect(echoed).toEqual([]);
  });

  it("drops an indicator for a channel the socket never joined", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const fixture = await createServerWithChannel(ada, "Analytical Engine");

    await createServerWithChannel(grace, "Difference Engine");

    const watcher = await open(ada);
    const stranger = await open(grace);

    const seen = watch(watcher);

    stranger.emit("typing:start", { channelId: fixture.channelId });

    await sleep(SETTLE_MS);

    expect(seen).toEqual([]);
  });

  it("drops an indicator from a member who cannot send messages there", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const fixture = await createServerWithChannel(ada, "Analytical Engine");

    await db
      .insert(serverMembers)
      .values({ serverId: fixture.serverId, userId: grace.id });

    await db.insert(channelMemberOverwrites).values({
      serverId: fixture.serverId,
      channelId: fixture.channelId,
      userId: grace.id,
      allow: 0,
      deny: Permissions.SEND_MESSAGES,
    });

    const watcher = await open(ada);
    const reader = await open(grace);

    const seen = watch(watcher);

    reader.emit("typing:start", { channelId: fixture.channelId });

    await sleep(SETTLE_MS);

    expect(seen).toEqual([]);
  });

  it("drops a malformed payload without consuming a rate-limit point", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const fixture = await createServerWithChannel(ada, "Analytical Engine");

    await db
      .insert(serverMembers)
      .values({ serverId: fixture.serverId, userId: grace.id });

    const watcher = await open(grace);
    const author = await open(ada);

    const seen = watch(watcher);

    author.emit("typing:start", { channelId: "not-a-uuid" });

    await sleep(SETTLE_MS);

    expect(seen).toEqual([]);
    expect(
      await redis.get(`${namespace}:typing:${ada.id}:${fixture.channelId}`),
    ).toBeNull();
  });

  it("drops the third indicator inside the window and counts it in Redis", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const fixture = await createServerWithChannel(ada, "Analytical Engine");

    await db
      .insert(serverMembers)
      .values({ serverId: fixture.serverId, userId: grace.id });

    const watcher = await open(grace);
    const author = await open(ada);

    const seen = watch(watcher);

    for (let index = 0; index < 3; index += 1) {
      author.emit("typing:start", { channelId: fixture.channelId });
      await sleep(50);
    }

    await sleep(SETTLE_MS);

    expect(seen).toHaveLength(2);
    expect(
      await redis.get(`${namespace}:typing:${ada.id}:${fixture.channelId}`),
    ).toBe("3");
  });
});
