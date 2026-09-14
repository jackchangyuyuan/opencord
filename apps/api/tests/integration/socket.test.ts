import { createServer, type Server as HttpServer } from "node:http";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { config } from "../../src/config.js";
import { db } from "../../src/db/index.js";
import { sessions } from "../../src/db/schema/index.js";
import {
  createSocketServer,
  type SocketService,
} from "../../src/socket/index.js";
import { cookieHeader, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

type Client = Socket<ServerToClientEvents, ClientToServerEvents>;

const INSIDE_REFRESH_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;

async function signIn(): Promise<string> {
  return cookieHeader((await signUp("ada")).cookies);
}

function tamper(cookie: string): string {
  return cookie.replace(/=[^;]*/g, "=not-a-real-session-token");
}

describe("Socket.IO handshake", () => {
  let httpServer: HttpServer;
  let socketServer: SocketService;
  let origin: string;
  const clients: Client[] = [];

  beforeAll(() => {
    requireTestDatabase();
  });

  beforeEach(async () => {
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

  function open(cookie?: string): Client {
    const client: Client = connect(origin, {
      autoConnect: false,
      reconnection: false,
      transports: ["websocket"],
      ...(cookie === undefined ? {} : { extraHeaders: { cookie } }),
    });

    clients.push(client);

    return client;
  }

  function rejectionOf(client: Client): Promise<string> {
    return new Promise<string>((resolve) => {
      client.once("connect_error", (error) => {
        resolve(error.message);
      });
    });
  }

  it("greets a client whose session cookie rides the handshake", async () => {
    const client = open(await signIn());

    const ready = new Promise<{ instanceId: string }>((resolve) => {
      client.once("connection:ready", resolve);
    });
    const disconnected = new Promise<string>((resolve) => {
      client.once("disconnect", resolve);
    });

    client.connect();

    await expect(ready).resolves.toEqual({ instanceId: config.INSTANCE_ID });

    await socketServer.close();

    await expect(disconnected).resolves.toBe("transport close");
    expect(client.connected).toBe(false);
  });

  it("does not extend the session lifetime on connect", async () => {
    const cookie = await signIn();

    const expiresAt = new Date(Date.now() + INSIDE_REFRESH_WINDOW_MS);

    await db.update(sessions).set({ expiresAt });

    const client = open(cookie);
    const ready = new Promise<{ instanceId: string }>((resolve) => {
      client.once("connection:ready", resolve);
    });

    client.connect();

    await expect(ready).resolves.toEqual({ instanceId: config.INSTANCE_ID });

    const stored = await db.query.sessions.findFirst({
      columns: { expiresAt: true },
    });

    expect(stored?.expiresAt).toEqual(expiresAt);
  });

  it("rejects a connection that carries no cookie", async () => {
    const client = open();
    const rejected = rejectionOf(client);

    client.connect();

    await expect(rejected).resolves.toBe("Unauthorized");
    expect(client.connected).toBe(false);
  });

  it("rejects a connection whose session token is invalid", async () => {
    const client = open(tamper(await signIn()));
    const rejected = rejectionOf(client);

    client.connect();

    await expect(rejected).resolves.toBe("Unauthorized");
    expect(client.connected).toBe(false);
  });

  it("rejects a connection whose session has expired", async () => {
    const cookie = await signIn();

    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 60_000) });

    const client = open(cookie);
    const rejected = rejectionOf(client);

    client.connect();

    await expect(rejected).resolves.toBe("Unauthorized");
    expect(client.connected).toBe(false);
  });
});
