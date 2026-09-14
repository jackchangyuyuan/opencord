import { randomUUID } from "node:crypto";
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

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { roles, serverMembers } from "../../src/db/schema/index.js";
import { createSocketServer } from "../../src/socket/index.js";
import type { SocketServer } from "../../src/socket/types.js";
import { type Account, cookieHeader, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Instance {
  io: SocketServer;
  close: () => Promise<void>;
  origin: string;
}

const password = "correct horse battery staple";

const SETTLE_TIMEOUT_MS = 10_000;
const SETTLE_POLL_MS = 25;
const TEST_TIMEOUT_MS = 20_000;
const SILENCE_MS = 250;

const serverBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string(), name: z.string() }));

function accountOf(res: request.Response, id: string): Account {
  return { id, cookies: res.get("Set-Cookie") ?? [] };
}

async function signIn(account: Account): Promise<Account> {
  const res = await request(app)
    .post("/api/auth/sign-in/email")
    .send({ email: `${account.id}@example.com`, password });

  expect(res.status).toBe(200);

  return accountOf(res, account.id);
}

async function startInstance(): Promise<Instance> {
  const httpServer = createServer(app);
  const sockets = await createSocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const address = httpServer.address();

  if (address === null || typeof address === "string") {
    throw new Error("Expected the server to listen on a TCP port");
  }

  return { ...sockets, origin: `http://127.0.0.1:${String(address.port)}` };
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("cross-instance permission revocation", () => {
  let holder: Instance;
  let mutator: Instance;
  const clients: Client[] = [];

  beforeAll(() => {
    requireTestDatabase();
    vi.setConfig({ testTimeout: TEST_TIMEOUT_MS });
  });

  beforeEach(async () => {
    holder = await startInstance();
    mutator = await startInstance();
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.close();
    }

    await Promise.all([holder.close(), mutator.close()]);
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

  async function roomsOn(instance: Instance): Promise<Set<string>> {
    const [socket] = await instance.io.local.fetchSockets();

    return new Set(socket?.rooms ?? []);
  }

  async function settle(
    instance: Instance,
    predicate: (rooms: Set<string>) => boolean,
  ): Promise<Set<string>> {
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;

    for (;;) {
      const rooms = await roomsOn(instance);

      if (predicate(rooms) || Date.now() > deadline) {
        return rooms;
      }

      await sleep(SETTLE_POLL_MS);
    }
  }

  function silence(client: Client, ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(true);
      }, ms);

      client.once("message:create", () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  async function seed(): Promise<{
    ada: Account;
    grace: Account;
    serverId: string;
    channelId: string;
    everyoneRoleId: string;
  }> {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    const created = await request(app)
      .post("/api/v1/servers")
      .set("Cookie", ada.cookies)
      .send({ name: "Analytical Engine" });

    const serverId = serverBody.parse(created.body).id;

    await db.insert(serverMembers).values({ serverId, userId: grace.id });

    const listed = await request(app)
      .get(`/api/v1/servers/${serverId}/channels`)
      .set("Cookie", ada.cookies);

    const [channel] = channelList.parse(listed.body);
    const everyone = await db.query.roles.findFirst({
      columns: { id: true },
      where: { serverId, isDefault: true },
    });

    if (channel === undefined || everyone === undefined) {
      throw new Error("the fixture is incomplete");
    }

    return {
      ada,
      grace,
      serverId,
      channelId: channel.id,
      everyoneRoleId: everyone.id,
    };
  }

  it("announces nothing when a role assignment changes nothing", async () => {
    const fixture = await seed();
    const client = await open(holder, fixture.grace);

    const [role] = await db
      .insert(roles)
      .values({
        serverId: fixture.serverId,
        name: "moderator",
        permissions: Permissions.SEND_MESSAGES,
        position: 1,
      })
      .returning({ id: roles.id });

    if (role === undefined) {
      throw new Error("the role insert returned no row");
    }

    const assign = () =>
      request(app)
        .put(
          `/api/v1/servers/${fixture.serverId}/members/${fixture.grace.id}/roles/${role.id}`,
        )
        .set("Cookie", fixture.ada.cookies);

    const announced = new Promise<{ serverId: string }>((resolve) => {
      client.once("permissions:changed", resolve);
    });

    expect((await assign()).status).toBe(200);
    await expect(announced).resolves.toEqual({ serverId: fixture.serverId });

    const quiet = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        resolve(true);
      }, SILENCE_MS);

      client.once("permissions:changed", () => {
        clearTimeout(timer);
        resolve(false);
      });
    });

    expect((await assign()).status).toBe(200);
    await expect(quiet).resolves.toBe(true);
  });

  it("removes the channel room of a socket held by the other instance", async () => {
    const fixture = await seed();
    const client = await open(holder, fixture.grace);

    expect((await roomsOn(holder)).has(`channel:${fixture.channelId}`)).toBe(
      true,
    );

    const announced = new Promise<{ serverId: string }>((resolve) => {
      client.once("permissions:changed", resolve);
    });

    const denied = await request(app)
      .put(
        `/api/v1/channels/${fixture.channelId}/overwrites/roles/${fixture.everyoneRoleId}`,
      )
      .set("Cookie", fixture.ada.cookies)
      .send({ deny: Permissions.VIEW_CHANNEL });

    expect(denied.status).toBe(200);

    await expect(announced).resolves.toEqual({ serverId: fixture.serverId });

    const rooms = await settle(
      holder,
      (current) => !current.has(`channel:${fixture.channelId}`),
    );

    expect(rooms.has(`channel:${fixture.channelId}`)).toBe(false);
    expect(rooms.has(`server:${fixture.serverId}`)).toBe(true);

    const quiet = silence(client, SILENCE_MS);

    const posted = await request(app)
      .post(`/api/v1/channels/${fixture.channelId}/messages`)
      .set("Cookie", fixture.ada.cookies)
      .send({ content: "after the revocation", nonce: randomUUID() });

    expect(posted.status).toBe(201);
    await expect(quiet).resolves.toBe(true);
  });

  it("restores the room when the overwrite is removed", async () => {
    const fixture = await seed();

    await open(holder, fixture.grace);

    await request(app)
      .put(
        `/api/v1/channels/${fixture.channelId}/overwrites/roles/${fixture.everyoneRoleId}`,
      )
      .set("Cookie", fixture.ada.cookies)
      .send({ deny: Permissions.VIEW_CHANNEL });

    await settle(holder, (rooms) => !rooms.has(`channel:${fixture.channelId}`));

    await request(app)
      .delete(
        `/api/v1/channels/${fixture.channelId}/overwrites/roles/${fixture.everyoneRoleId}`,
      )
      .set("Cookie", fixture.ada.cookies);

    const rooms = await settle(holder, (current) =>
      current.has(`channel:${fixture.channelId}`),
    );

    expect(rooms.has(`channel:${fixture.channelId}`)).toBe(true);
  });

  it("adds the room for a channel created on the other instance", async () => {
    const fixture = await seed();

    await open(holder, fixture.grace);

    const created = await request(app)
      .post(`/api/v1/servers/${fixture.serverId}/channels`)
      .set("Cookie", fixture.ada.cookies)
      .send({ name: "engines" });

    expect(created.status).toBe(201);

    const channelId = serverBody.parse(created.body).id;

    const rooms = await settle(holder, (current) =>
      current.has(`channel:${channelId}`),
    );

    expect(rooms.has(`channel:${channelId}`)).toBe(true);
  });

  it("drops every room of a server deleted on the other instance", async () => {
    const fixture = await seed();

    await open(holder, fixture.grace);

    const removed = await request(app)
      .delete(`/api/v1/servers/${fixture.serverId}`)
      .set("Cookie", fixture.ada.cookies);

    expect(removed.status).toBe(204);

    const rooms = await settle(
      holder,
      (current) => !current.has(`server:${fixture.serverId}`),
    );

    expect(rooms.has(`server:${fixture.serverId}`)).toBe(false);
    expect(rooms.has(`channel:${fixture.channelId}`)).toBe(false);
    expect(rooms.has(`user:${fixture.grace.id}`)).toBe(true);
  });

  function send(author: Account, channelId: string) {
    return request(app)
      .post(`/api/v1/channels/${channelId}/messages`)
      .set("Cookie", author.cookies)
      .send({ content: "after the door closed", nonce: randomUUID() });
  }

  it("delivers nothing written after access was taken away", async () => {
    const fixture = await seed();
    const client = await open(holder, fixture.grace);

    const denied = await request(app)
      .put(
        `/api/v1/channels/${fixture.channelId}/overwrites/roles/${fixture.everyoneRoleId}`,
      )
      .set("Cookie", fixture.ada.cookies)
      .send({ deny: Permissions.VIEW_CHANNEL });

    expect(denied.status).toBeLessThan(300);

    const quiet = silence(client, SILENCE_MS);

    expect((await send(fixture.ada, fixture.channelId)).status).toBe(201);
    await expect(quiet).resolves.toBe(true);
  });

  it("keeps the mutating instance's own view consistent", async () => {
    const fixture = await seed();

    await open(mutator, fixture.grace);

    await request(app)
      .put(
        `/api/v1/channels/${fixture.channelId}/overwrites/roles/${fixture.everyoneRoleId}`,
      )
      .set("Cookie", fixture.ada.cookies)
      .send({ deny: Permissions.VIEW_CHANNEL });

    const rooms = await settle(
      mutator,
      (current) => !current.has(`channel:${fixture.channelId}`),
    );

    expect(rooms.has(`channel:${fixture.channelId}`)).toBe(false);
  });
});

describe("session-scoped revocation", () => {
  let holder: Instance;
  let mutator: Instance;
  const clients: Client[] = [];

  beforeAll(() => {
    requireTestDatabase();
    vi.setConfig({ testTimeout: TEST_TIMEOUT_MS });
  });

  beforeEach(async () => {
    holder = await startInstance();
    mutator = await startInstance();
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.close();
    }

    await Promise.all([holder.close(), mutator.close()]);
  });

  async function open(instance: Instance, cookie: string): Promise<Client> {
    const client: Client = connect(instance.origin, {
      autoConnect: false,
      extraHeaders: { cookie },
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

  it("closes the signed-out session's socket and leaves the sibling alone", async () => {
    const ada = await signUp("ada");
    const laptop = await signIn({ ...ada, id: "ada" });

    const phoneClient = await open(holder, cookieHeader(ada.cookies));
    const laptopClient = await open(mutator, cookieHeader(laptop.cookies));

    const revoked = new Promise<void>((resolve) => {
      phoneClient.once("session:revoked", resolve);
    });
    const closed = new Promise<string>((resolve) => {
      phoneClient.once("disconnect", resolve);
    });

    const out = await request(app)
      .post("/api/auth/sign-out")
      .set("Cookie", ada.cookies);

    expect(out.status).toBe(200);

    await revoked;
    await expect(closed).resolves.toBe("io server disconnect");

    await sleep(SILENCE_MS);

    expect(laptopClient.connected).toBe(true);
  });

  it("does nothing when the sign-out carried no session", async () => {
    const ada = await signUp("ada");
    const client = await open(holder, cookieHeader(ada.cookies));

    await request(app).post("/api/auth/sign-out");

    await sleep(SILENCE_MS);

    expect(client.connected).toBe(true);
  });
});
