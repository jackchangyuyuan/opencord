import { createServer, type Server as HttpServer } from "node:http";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import { Permissions } from "@opencord/shared/permissions";
import { and, eq } from "drizzle-orm";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  auditLog,
  bans,
  channelMemberOverwrites,
  memberRoles,
  roles,
  serverMembers,
} from "../../src/db/schema/index.js";
import { createSocketServer } from "../../src/socket/index.js";
import { requireTestDatabase } from "../setup.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const SETTLE_TIMEOUT_MS = 2000;
const SETTLE_POLL_MS = 25;

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const idBody = z.object({ id: z.string() });
const errorBody = z.object({ error: z.object({ code: z.string() }) });

const banList = z.array(
  z.object({
    user: z.object({ id: z.string(), username: z.string() }),
    reason: z.string().nullable(),
    bannedBy: z.string(),
    createdAt: z.string(),
  }),
);

interface Account {
  id: string;
  cookies: string[];
}

interface Fixture {
  ada: Account;
  grace: Account;
  hopper: Account;
  serverId: string;
  channelId: string;
  everyoneRoleId: string;
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

  return {
    id: signUpBody.parse(res.body).user.id,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

async function seed(): Promise<Fixture> {
  const ada = await signUp("ada");
  const grace = await signUp("grace");
  const hopper = await signUp("hopper");

  const created = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", ada.cookies)
    .send({ name: "Analytical Engine" });

  expect(created.status).toBe(201);

  const serverId = idBody.parse(created.body).id;

  await db.insert(serverMembers).values([
    { serverId, userId: grace.id },
    { serverId, userId: hopper.id },
  ]);

  const listed = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", ada.cookies);

  const [channel] = z.array(z.object({ id: z.string() })).parse(listed.body);

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
    hopper,
    serverId,
    channelId: channel.id,
    everyoneRoleId: everyone.id,
  };
}

function grantEveryone(serverId: string, mask: number) {
  return db
    .update(roles)
    .set({ permissions: mask })
    .where(and(eq(roles.serverId, serverId), eq(roles.isDefault, true)));
}

function kick(account: Account, serverId: string, userId: string) {
  return request(app)
    .delete(`/api/v1/servers/${serverId}/members/${userId}`)
    .set("Cookie", account.cookies);
}

function ban(
  account: Account,
  serverId: string,
  userId: string,
  body: Record<string, unknown> = {},
) {
  return request(app)
    .put(`/api/v1/servers/${serverId}/bans/${userId}`)
    .set("Cookie", account.cookies)
    .send(body);
}

function unban(account: Account, serverId: string, userId: string) {
  return request(app)
    .delete(`/api/v1/servers/${serverId}/bans/${userId}`)
    .set("Cookie", account.cookies);
}

function listBanned(account: Account, serverId: string) {
  return request(app)
    .get(`/api/v1/servers/${serverId}/bans`)
    .set("Cookie", account.cookies);
}

function memberships(serverId: string, userId: string) {
  return db
    .select({ userId: serverMembers.userId })
    .from(serverMembers)
    .where(
      and(
        eq(serverMembers.serverId, serverId),
        eq(serverMembers.userId, userId),
      ),
    );
}

describe("moderation", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("kicks a member with KICK_MEMBERS", async () => {
    const fixture = await seed();

    const res = await kick(fixture.ada, fixture.serverId, fixture.grace.id);

    expect(res.status).toBe(204);
    await expect(
      memberships(fixture.serverId, fixture.grace.id),
    ).resolves.toEqual([]);
  });

  it("leaves no ban row behind on a kick", async () => {
    const fixture = await seed();

    await kick(fixture.ada, fixture.serverId, fixture.grace.id);

    const rows = await db
      .select()
      .from(bans)
      .where(eq(bans.serverId, fixture.serverId));

    expect(rows).toEqual([]);
  });

  it("refuses a kick without the bit", async () => {
    const fixture = await seed();

    const res = await kick(fixture.grace, fixture.serverId, fixture.hopper.id);

    expect(res.status).toBe(403);
    await expect(
      memberships(fixture.serverId, fixture.hopper.id),
    ).resolves.toHaveLength(1);
  });

  it("refuses kicking a peer of equal standing", async () => {
    const fixture = await seed();

    await grantEveryone(
      fixture.serverId,
      Permissions.VIEW_CHANNEL | Permissions.KICK_MEMBERS,
    );

    const res = await kick(fixture.grace, fixture.serverId, fixture.hopper.id);

    expect(res.status).toBe(403);
    expect(errorBody.parse(res.body).error.code).toBe("ROLE_HIERARCHY");
  });

  it("refuses kicking the owner, even as an administrator", async () => {
    const fixture = await seed();

    await grantEveryone(
      fixture.serverId,
      Permissions.VIEW_CHANNEL | Permissions.ADMINISTRATOR,
    );

    const res = await kick(fixture.grace, fixture.serverId, fixture.ada.id);

    expect(res.status).toBe(403);
    expect(errorBody.parse(res.body).error.code).toBe("TARGET_IS_OWNER");
    await expect(
      memberships(fixture.serverId, fixture.ada.id),
    ).resolves.toHaveLength(1);
  });

  it("refuses banning the owner, even as an administrator", async () => {
    const fixture = await seed();

    await grantEveryone(
      fixture.serverId,
      Permissions.VIEW_CHANNEL | Permissions.ADMINISTRATOR,
    );

    const res = await ban(fixture.grace, fixture.serverId, fixture.ada.id);

    expect(res.status).toBe(403);
    expect(errorBody.parse(res.body).error.code).toBe("TARGET_IS_OWNER");
  });

  it("bans a member, removing the membership in the same transaction", async () => {
    const fixture = await seed();

    const res = await ban(fixture.ada, fixture.serverId, fixture.grace.id, {
      reason: "spam",
    });

    expect(res.status).toBe(204);
    await expect(
      memberships(fixture.serverId, fixture.grace.id),
    ).resolves.toEqual([]);

    const listed = await listBanned(fixture.ada, fixture.serverId);

    expect(banList.parse(listed.body)).toEqual([
      expect.objectContaining({
        reason: "spam",
        bannedBy: fixture.ada.id,
      }),
    ]);
  });

  it("cascades the member's roles and overwrites away", async () => {
    const fixture = await seed();

    const role = await request(app)
      .post(`/api/v1/servers/${fixture.serverId}/roles`)
      .set("Cookie", fixture.ada.cookies)
      .send({ name: "mods", permissions: Permissions.VIEW_CHANNEL });

    expect(role.status).toBe(201);

    const roleId = idBody.parse(role.body).id;

    const assigned = await request(app)
      .put(
        `/api/v1/servers/${fixture.serverId}/members/${fixture.grace.id}/roles/${roleId}`,
      )
      .set("Cookie", fixture.ada.cookies);

    expect(assigned.status).toBe(200);

    const overwrite = await request(app)
      .put(
        `/api/v1/channels/${fixture.channelId}/overwrites/members/${fixture.grace.id}`,
      )
      .set("Cookie", fixture.ada.cookies)
      .send({ allow: Permissions.SEND_MESSAGES, deny: 0 });

    expect(overwrite.status).toBe(200);

    await ban(fixture.ada, fixture.serverId, fixture.grace.id);

    await expect(
      db
        .select()
        .from(memberRoles)
        .where(eq(memberRoles.userId, fixture.grace.id)),
    ).resolves.toEqual([]);
    await expect(
      db
        .select()
        .from(channelMemberOverwrites)
        .where(eq(channelMemberOverwrites.userId, fixture.grace.id)),
    ).resolves.toEqual([]);
  });

  it("bans someone who is not a member", async () => {
    const fixture = await seed();
    const stranger = await signUp("stranger");

    const res = await ban(fixture.ada, fixture.serverId, stranger.id);

    expect(res.status).toBe(204);

    const listed = await listBanned(fixture.ada, fixture.serverId);

    expect(banList.parse(listed.body)).toHaveLength(1);
  });

  it("unbans with BAN_MEMBERS alone", async () => {
    const fixture = await seed();

    await ban(fixture.ada, fixture.serverId, fixture.grace.id);

    const res = await unban(fixture.ada, fixture.serverId, fixture.grace.id);

    expect(res.status).toBe(204);
    expect(
      banList.parse((await listBanned(fixture.ada, fixture.serverId)).body),
    ).toEqual([]);
  });

  it("reports an unban of someone who is not banned", async () => {
    const fixture = await seed();

    const res = await unban(fixture.ada, fixture.serverId, fixture.grace.id);

    expect(res.status).toBe(404);
    expect(errorBody.parse(res.body).error.code).toBe("BAN_NOT_FOUND");
  });

  it("hides the ban list without BAN_MEMBERS", async () => {
    const fixture = await seed();

    const res = await listBanned(fixture.grace, fixture.serverId);

    expect(res.status).toBe(403);
  });

  it("audits all three actions", async () => {
    const fixture = await seed();

    await kick(fixture.ada, fixture.serverId, fixture.hopper.id);
    await ban(fixture.ada, fixture.serverId, fixture.grace.id);
    await unban(fixture.ada, fixture.serverId, fixture.grace.id);

    const rows = await db
      .select({ action: auditLog.action, targetId: auditLog.targetId })
      .from(auditLog)
      .where(eq(auditLog.serverId, fixture.serverId))
      .orderBy(auditLog.id);

    expect(rows).toEqual([
      { action: "member_kick", targetId: fixture.hopper.id },
      { action: "member_ban", targetId: fixture.grace.id },
      { action: "member_unban", targetId: fixture.grace.id },
    ]);
  });

  it("refuses kicking someone who is not a member", async () => {
    const fixture = await seed();
    const stranger = await signUp("stranger");

    const res = await kick(fixture.ada, fixture.serverId, stranger.id);

    expect(res.status).toBe(404);
    expect(errorBody.parse(res.body).error.code).toBe("MEMBER_NOT_FOUND");
  });

  it("refuses kicking yourself", async () => {
    const fixture = await seed();

    await grantEveryone(
      fixture.serverId,
      Permissions.VIEW_CHANNEL | Permissions.KICK_MEMBERS,
    );

    const res = await kick(fixture.grace, fixture.serverId, fixture.grace.id);

    expect(res.status).toBe(403);
    expect(errorBody.parse(res.body).error.code).toBe("TARGET_IS_SELF");
  });
});

describe("moderation over the socket", () => {
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
    const cookie = account.cookies
      .flatMap((entry) => entry.split(";", 1))
      .join("; ");

    const client: Client = connect(origin, {
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

  async function roomsOf(socketId: string): Promise<Set<string>> {
    const sockets = await io.local.fetchSockets();
    const socket = sockets.find((entry) => entry.id === socketId);

    return new Set(socket?.rooms ?? []);
  }

  async function settle(
    socketId: string,
    predicate: (rooms: Set<string>) => boolean,
  ): Promise<Set<string>> {
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;

    for (;;) {
      const rooms = await roomsOf(socketId);

      if (predicate(rooms) || Date.now() > deadline) {
        return rooms;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, SETTLE_POLL_MS);
      });
    }
  }

  it("takes a kicked member out of the server and channel rooms", async () => {
    const fixture = await seed();
    const client = await open(fixture.grace);
    const socketId = client.id ?? "";

    expect(await roomsOf(socketId)).toContain(`server:${fixture.serverId}`);

    expect(
      (await kick(fixture.ada, fixture.serverId, fixture.grace.id)).status,
    ).toBe(204);

    const rooms = await settle(
      socketId,
      (current) => !current.has(`server:${fixture.serverId}`),
    );

    expect(rooms.has(`server:${fixture.serverId}`)).toBe(false);
    expect(rooms.has(`channel:${fixture.channelId}`)).toBe(false);
  });

  it("closes a banned member's socket", async () => {
    const fixture = await seed();
    const client = await open(fixture.grace);

    const closed = new Promise<void>((resolve) => {
      client.once("disconnect", () => {
        resolve();
      });
    });

    expect(
      (await ban(fixture.ada, fixture.serverId, fixture.grace.id)).status,
    ).toBe(204);

    await closed;

    expect(client.connected).toBe(false);
  });
});
