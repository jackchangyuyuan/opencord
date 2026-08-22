import { createServer, type Server as HttpServer } from "node:http";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import { Permissions } from "@opencord/shared/permissions";
import { eq } from "drizzle-orm";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { resolveAccessibleChannels } from "../../src/access/channels.js";
import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  channelRoleOverwrites,
  serverMembers,
  users,
} from "../../src/db/schema/index.js";
import { revalidateSessions } from "../../src/socket/auth.js";
import { createSocketServer } from "../../src/socket/index.js";
import { requireTestDatabase } from "../setup.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const password = "correct horse battery staple";
const SETTLE_TIMEOUT_MS = 2000;
const SETTLE_POLL_MS = 25;

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const serverBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string(), name: z.string() }));

interface Account {
  id: string;
  cookie: string;
  cookies: string[];
}

async function signUp(username: string): Promise<Account> {
  const res = await request(app)
    .post("/api/auth/sign-up/email")
    .send({
      email: `${username}@example.com`,
      name: username,
      password,
      username,
    });

  expect(res.status).toBe(200);

  const cookies = res.get("Set-Cookie") ?? [];

  return {
    id: signUpBody.parse(res.body).user.id,
    cookie: cookies.flatMap((cookie) => cookie.split(";", 1)).join("; "),
    cookies,
  };
}

async function createServerFor(
  account: Account,
  name: string,
): Promise<string> {
  const res = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", account.cookies)
    .send({ name });

  expect(res.status).toBe(201);

  return serverBody.parse(res.body).id;
}

async function listChannels(
  account: Account,
  serverId: string,
): Promise<{ id: string; name: string }[]> {
  const res = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", account.cookies);

  return channelList.parse(res.body);
}

describe("socket rooms", () => {
  let httpServer: HttpServer;
  let io: ReturnType<typeof createSocketServer>;
  let origin: string;
  const clients: Client[] = [];

  beforeAll(() => {
    requireTestDatabase();
  });

  beforeEach(async () => {
    httpServer = createServer(app);
    io = createSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", resolve);
    });

    const address = httpServer.address();

    if (address === null || typeof address === "string") {
      throw new Error("Expected the server to listen on a TCP port");
    }

    origin = `http://127.0.0.1:${String(address.port)}`;
  });

  afterEach(async () => {
    for (const client of clients.splice(0)) {
      client.close();
    }

    await io.close();
  });

  async function open(account: Account): Promise<Client> {
    const client: Client = connect(origin, {
      autoConnect: false,
      extraHeaders: { cookie: account.cookie },
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

  async function settle(
    client: Client,
    predicate: (rooms: Set<string>) => boolean,
  ): Promise<Set<string>> {
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;

    for (;;) {
      const rooms = await roomsOf(client);

      if (predicate(rooms) || Date.now() > deadline) {
        return rooms;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, SETTLE_POLL_MS);
      });
    }
  }

  async function roomsOf(client: Client): Promise<Set<string>> {
    const [socket] = await io.local.fetchSockets();

    expect(socket).toBeDefined();
    expect(socket?.id).toBe(client.id);

    return new Set(socket?.rooms ?? []);
  }

  it("joins the user, session, server and channel rooms", async () => {
    const ada = await signUp("ada");
    const serverId = await createServerFor(ada, "Analytical Engine");
    const channels = await listChannels(ada, serverId);

    const client = await open(ada);
    const rooms = await roomsOf(client);

    expect(rooms.has(`user:${ada.id}`)).toBe(true);
    expect(rooms.has(`server:${serverId}`)).toBe(true);

    for (const channel of channels) {
      expect(rooms.has(`channel:${channel.id}`)).toBe(true);
    }

    const sessionRooms = [...rooms].filter((room) =>
      room.startsWith("session:"),
    );

    expect(sessionRooms).toHaveLength(1);
  });

  it("joins exactly the accessible channel set", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServerFor(ada, "Analytical Engine");

    await db.insert(serverMembers).values({ serverId, userId: grace.id });

    const client = await open(grace);
    const rooms = await roomsOf(client);
    const accessible = await resolveAccessibleChannels(grace.id);

    const joined = new Set(
      [...rooms]
        .filter((room) => room.startsWith("channel:"))
        .map((room) => room.slice("channel:".length)),
    );

    expect(joined).toEqual(accessible);
    expect(joined.size).toBe(2);
  });

  it("leaves a denied channel out of the room set", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServerFor(ada, "Analytical Engine");

    await db.insert(serverMembers).values({ serverId, userId: grace.id });

    const channels = await listChannels(ada, serverId);
    const everyone = await db.query.roles.findFirst({
      columns: { id: true },
      where: { serverId, isDefault: true },
    });

    await db.insert(channelRoleOverwrites).values({
      channelId: channels[0]?.id ?? "",
      serverId,
      roleId: everyone?.id ?? "",
      deny: Permissions.VIEW_CHANNEL,
    });

    const client = await open(grace);
    const rooms = await roomsOf(client);

    expect(rooms.has(`channel:${channels[0]?.id ?? ""}`)).toBe(false);
    expect(rooms.has(`channel:${channels[1]?.id ?? ""}`)).toBe(true);
  });

  it("joins the rooms of a server created while the socket is connected", async () => {
    const ada = await signUp("ada");

    const client = await open(ada);

    expect(
      [...(await roomsOf(client))].filter(
        (room) => room.startsWith("server:") || room.startsWith("channel:"),
      ),
    ).toEqual([]);

    const serverId = await createServerFor(ada, "Analytical Engine");
    const channels = await listChannels(ada, serverId);

    expect(channels).toHaveLength(2);

    const rooms = await settle(client, (current) =>
      channels.every((channel) => current.has(`channel:${channel.id}`)),
    );

    expect(rooms).toContain(`server:${serverId}`);

    for (const channel of channels) {
      expect(rooms).toContain(`channel:${channel.id}`);
    }
  });

  it("joins no channel room for a user who has joined nothing", async () => {
    const ada = await signUp("ada");

    const client = await open(ada);
    const rooms = await roomsOf(client);

    expect([...rooms].filter((room) => room.startsWith("channel:"))).toEqual(
      [],
    );
    expect([...rooms].filter((room) => room.startsWith("server:"))).toEqual([]);
  });

  it("closes a socket whose guest expiry has passed", async () => {
    const ada = await signUp("ada");
    const client = await open(ada);

    const closed = new Promise<string>((resolve) => {
      client.once("disconnect", resolve);
    });

    await db
      .update(users)
      .set({ guestExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(users.id, ada.id));

    await revalidateSessions(io);

    await expect(closed).resolves.toBe("io server disconnect");
  });

  it("closes a socket whose account has been deactivated", async () => {
    const ada = await signUp("ada");
    const client = await open(ada);

    const closed = new Promise<string>((resolve) => {
      client.once("disconnect", resolve);
    });

    await db
      .update(users)
      .set({ deactivatedAt: new Date() })
      .where(eq(users.id, ada.id));

    await revalidateSessions(io);

    await expect(closed).resolves.toBe("io server disconnect");
  });

  it("leaves a healthy socket connected across a revalidation tick", async () => {
    const ada = await signUp("ada");
    const client = await open(ada);

    await revalidateSessions(io);

    expect(client.connected).toBe(true);
  });
});
