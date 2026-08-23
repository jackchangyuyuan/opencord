import { createServer, type Server as HttpServer } from "node:http";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
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

const failing = vi.hoisted(() => ({ heartbeat: false }));

vi.mock("../../src/socket/presence.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/socket/presence.js")>();

  return {
    ...actual,
    recordHeartbeat: async (
      ...args: Parameters<typeof actual.recordHeartbeat>
    ) => {
      if (failing.heartbeat) {
        throw new Error("presence storage is unavailable");
      }

      await actual.recordHeartbeat(...args);
    },
  };
});

const { app } = await import("../../src/app.js");
const { createSocketServer } = await import("../../src/socket/index.js");
const { requireTestDatabase } = await import("../setup.js");

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const password = "correct horse battery staple";
const SETTLE_MS = 400;

const signUpBody = z.object({ user: z.object({ id: z.string() }) });

async function signUp(username: string): Promise<string> {
  const res = await request(app)
    .post("/api/auth/sign-up/email")
    .send({
      email: `${username}@example.com`,
      name: username,
      password,
      username,
    });

  expect(res.status).toBe(200);
  expect(signUpBody.parse(res.body).user.id).toBeTruthy();

  const cookies = res.get("Set-Cookie") ?? [];

  return cookies.flatMap((cookie) => cookie.split(";", 1)).join("; ");
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("a connection that cannot finish initialising is closed", () => {
  let httpServer: HttpServer;
  let io: ReturnType<typeof createSocketServer>;
  let origin: string;
  const clients: Client[] = [];

  beforeAll(() => {
    requireTestDatabase();
  });

  beforeEach(async () => {
    failing.heartbeat = false;
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
    failing.heartbeat = false;

    for (const client of clients.splice(0)) {
      client.close();
    }

    await io.close();
  });

  function open(cookie: string): Client {
    const client: Client = connect(origin, {
      autoConnect: false,
      extraHeaders: { cookie },
      reconnection: false,
      transports: ["websocket"],
    });

    clients.push(client);
    client.connect();

    return client;
  }

  it("never reports ready and leaves no socket behind when presence fails", async () => {
    const cookie = await signUp("ada");

    failing.heartbeat = true;

    let ready = 0;
    let disconnected = 0;

    const client = open(cookie);

    client.on("connection:ready", () => {
      ready += 1;
    });
    client.on("disconnect", () => {
      disconnected += 1;
    });

    await sleep(SETTLE_MS);

    expect(ready).toBe(0);
    expect(disconnected).toBe(1);
    expect(await io.local.fetchSockets()).toEqual([]);
  });

  it("reports ready once initialisation succeeds", async () => {
    const cookie = await signUp("ada");

    let ready = 0;

    const client = open(cookie);

    client.on("connection:ready", () => {
      ready += 1;
    });

    await sleep(SETTLE_MS);

    expect(ready).toBe(1);
    expect(await io.local.fetchSockets()).toHaveLength(1);
  });
});
