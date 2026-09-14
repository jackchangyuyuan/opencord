import { randomUUID } from "node:crypto";
import { createServer, type Server as HttpServer } from "node:http";

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
import {
  channelRoleOverwrites,
  messages,
  serverMembers,
} from "../../src/db/schema/index.js";
import {
  createSocketServer,
  type SocketService,
} from "../../src/socket/index.js";
import { type Account, cookieHeader, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const state = vi.hoisted(() => ({ auditFails: false }));

vi.mock("../../src/lib/audit.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/audit.js")>();

  return {
    ...actual,
    writeAudit: (...args: Parameters<typeof actual.writeAudit>) =>
      state.auditFails
        ? Promise.reject(new Error("audit insert failed"))
        : actual.writeAudit(...args),
  };
});

const serverBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string(), name: z.string() }));
const messageBody = z.object({ id: z.string() });

describe("message broadcasts", () => {
  let httpServer: HttpServer;
  let socketServer: SocketService;
  let origin: string;
  const clients: Client[] = [];

  beforeAll(() => {
    requireTestDatabase();
  });

  beforeEach(async () => {
    state.auditFails = false;
    httpServer = createServer(app);
    socketServer = await createSocketServer(httpServer);

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

    await socketServer.close();
  });

  async function open(account: Account): Promise<Client> {
    const client: Client = connect(origin, {
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

  function send(account: Account, channelId: string, content: string) {
    return request(app)
      .post(`/api/v1/channels/${channelId}/messages`)
      .set("Cookie", account.cookies)
      .send({ content, nonce: randomUUID() });
  }

  function nextEvent<Event extends keyof ServerToClientEvents>(
    client: Client,
    event: Event,
  ): Promise<Parameters<ServerToClientEvents[Event]>[0]> {
    return new Promise((resolve) => {
      client.once(event, resolve as never);
    });
  }

  function silence(
    listener: Client,
    event: keyof ServerToClientEvents,
    ms: number,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve(true);
      }, ms);

      listener.once(event, () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  it("delivers message:create to another member of the channel", async () => {
    const fixture = await seed();
    const listener = await open(fixture.grace);

    const received = nextEvent(listener, "message:create");

    const posted = await send(fixture.ada, fixture.channelId, "hello");

    expect(posted.status).toBe(201);

    const event = await received;

    expect(event.message.id).toBe(messageBody.parse(posted.body).id);
    expect(event.message.content).toBe("hello");
    expect(event.message.replyTo).toBeNull();
  });

  it("delivers message:update on an edit", async () => {
    const fixture = await seed();
    const listener = await open(fixture.grace);

    const posted = messageBody.parse(
      (await send(fixture.ada, fixture.channelId, "hello")).body,
    );

    const received = nextEvent(listener, "message:update");

    await request(app)
      .patch(`/api/v1/channels/${fixture.channelId}/messages/${posted.id}`)
      .set("Cookie", fixture.ada.cookies)
      .send({ content: "corrected" });

    const event = await received;

    expect(event.message).toMatchObject({
      id: posted.id,
      content: "corrected",
    });
    expect(event.message.editedAt).not.toBeNull();
  });

  it("delivers message:delete on a soft delete", async () => {
    const fixture = await seed();
    const listener = await open(fixture.grace);

    const posted = messageBody.parse(
      (await send(fixture.ada, fixture.channelId, "hello")).body,
    );

    const received = nextEvent(listener, "message:delete");

    await request(app)
      .delete(`/api/v1/channels/${fixture.channelId}/messages/${posted.id}`)
      .set("Cookie", fixture.ada.cookies);

    await expect(received).resolves.toMatchObject({
      channelId: fixture.channelId,
      messageId: posted.id,
    });
  });

  it("sends nothing to a client without VIEW_CHANNEL — the room is the filter", async () => {
    const fixture = await seed();

    await db.insert(channelRoleOverwrites).values({
      channelId: fixture.channelId,
      serverId: fixture.serverId,
      roleId: fixture.everyoneRoleId,
      deny: Permissions.VIEW_CHANNEL,
    });

    const listener = await open(fixture.grace);
    const quiet = silence(listener, "message:create", 250);

    expect((await send(fixture.ada, fixture.channelId, "hello")).status).toBe(
      201,
    );

    await expect(quiet).resolves.toBe(true);
  });

  it("never emits when the transaction rolled back", async () => {
    const fixture = await seed();
    const listener = await open(fixture.grace);

    const posted = messageBody.parse(
      (await send(fixture.grace, fixture.channelId, "hello")).body,
    );

    state.auditFails = true;

    const quiet = silence(listener, "message:delete", 250);

    const removed = await request(app)
      .delete(`/api/v1/channels/${fixture.channelId}/messages/${posted.id}`)
      .set("Cookie", fixture.ada.cookies);

    expect(removed.status).toBe(500);
    await expect(quiet).resolves.toBe(true);

    const stored = await db.query.messages.findFirst({
      where: { id: posted.id },
    });

    expect(stored?.deletedAt).toBeNull();
    expect(await db.select().from(messages)).toHaveLength(1);
  });
});
