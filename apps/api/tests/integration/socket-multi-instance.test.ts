import { createServer } from "node:http";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { createSocketServer } from "../../src/socket/index.js";
import type { SocketServer } from "../../src/socket/types.js";
import { requireTestDatabase } from "../setup.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

interface Instance {
  io: SocketServer;
  origin: string;
}

const PROBE = { instanceId: "cross-instance-probe" };
const PROBE_INTERVAL_MS = 25;

async function signUp(): Promise<string> {
  const res = await request(app).post("/api/auth/sign-up/email").send({
    email: "ada@example.com",
    name: "Ada",
    password: "correct horse battery staple",
  });

  expect(res.status).toBe(200);

  const cookies = res.get("Set-Cookie") ?? [];

  return cookies.flatMap((cookie) => cookie.split(";", 1)).join("; ");
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

function socketIdOf(client: Client): string {
  const { id } = client;

  if (id === undefined) {
    throw new Error("Expected the client to be connected");
  }

  return id;
}

describe("cross-instance Socket.IO delivery", () => {
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

  it("delivers an event emitted on one instance to a client on the other", async () => {
    const cookie = await signUp();

    await open(one, cookie);
    const b = await open(two, cookie);

    const remote = socketIdOf(b);

    const received = new Promise<{ instanceId: string }>((resolve) => {
      b.once("connection:ready", resolve);
    });

    const emitting = setInterval(() => {
      one.io.to(remote).emit("connection:ready", PROBE);
    }, PROBE_INTERVAL_MS);

    try {
      one.io.to(remote).emit("connection:ready", PROBE);

      await expect(received).resolves.toEqual(PROBE);
    } finally {
      clearInterval(emitting);
    }
  });
});
