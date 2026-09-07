import { createServer } from "node:http";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { config } from "../../src/config.js";
import { createSocketServer } from "../../src/socket/index.js";
import { countOnlineUsers, SWEEP_AFTER_MS } from "../../src/socket/presence.js";
import type { SocketServer } from "../../src/socket/types.js";
import { type Account, cookieHeader, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Instance {
  io: SocketServer;
  origin: string;
}

const statsBody = z.object({
  instanceId: z.string(),
  sockets: z.number(),
  onlineUsers: z.number(),
  uptimeSeconds: z.number(),
});

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

describe("GET /api/v1/stats", () => {
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

  it("refuses an anonymous request", async () => {
    const res = await request(app).get("/api/v1/stats");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("reports this instance to any authenticated caller", async () => {
    const ada = await signUp("ada");

    const res = await request(app)
      .get("/api/v1/stats")
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(200);

    const body = statsBody.parse(res.body);

    expect(body.instanceId).toBe(config.INSTANCE_ID);
    expect(body.sockets).toBe(0);
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("counts only the connections a sweeper has not yet reached", async () => {
    const ada = await signUp("ada");

    await open(ada);

    const settledAt = Date.now();

    expect(await countOnlineUsers(settledAt)).toBeGreaterThanOrEqual(1);
    expect(await countOnlineUsers(settledAt + SWEEP_AFTER_MS + 60_000)).toBe(0);
  });

  it("counts the sockets attached to this instance and the users online", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    await open(ada);
    await open(grace);

    const res = await request(app)
      .get("/api/v1/stats")
      .set("Cookie", ada.cookies);

    const body = statsBody.parse(res.body);

    expect(body.sockets).toBe(2);
    expect(body.onlineUsers).toBeGreaterThanOrEqual(2);
  });
});
