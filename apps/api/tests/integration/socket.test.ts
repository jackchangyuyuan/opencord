import { createServer, type Server as HttpServer } from "node:http";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { config } from "../../src/config.js";
import { createSocketServer } from "../../src/socket/index.js";

describe("Socket.IO handshake", () => {
  let httpServer: HttpServer;
  let io: ReturnType<typeof createSocketServer>;
  let client: Socket<ServerToClientEvents, ClientToServerEvents>;

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

    client = connect(`http://127.0.0.1:${String(address.port)}`, {
      autoConnect: false,
      reconnection: false,
      transports: ["websocket"],
    });
  });

  afterEach(async () => {
    client.close();
    await io.close();
  });

  it("greets a client and closes the socket on shutdown", async () => {
    const ready = new Promise<{ instanceId: string }>((resolve) => {
      client.once("connection:ready", resolve);
    });
    const disconnected = new Promise<string>((resolve) => {
      client.once("disconnect", resolve);
    });

    client.connect();

    await expect(ready).resolves.toEqual({ instanceId: config.INSTANCE_ID });

    await io.close();

    await expect(disconnected).resolves.toBe("transport close");
    expect(client.connected).toBe(false);
  });
});
