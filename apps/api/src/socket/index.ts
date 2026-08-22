import type { Server as HttpServer } from "node:http";

import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";

import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { redis } from "../redis.js";
import {
  authenticateSockets,
  revalidateSessions,
  REVALIDATION_INTERVAL_MS,
} from "./auth.js";
import { registerSocketServer, unregisterSocketServer } from "./emit.js";
import { joinRooms } from "./rooms.js";
import type { SocketServer } from "./types.js";

export function createSocketServer(httpServer: HttpServer): SocketServer {
  const io: SocketServer = new Server(httpServer, {
    transports: ["websocket"],
  });

  const publisher = redis.duplicate({ maxRetriesPerRequest: null });
  const subscriber = redis.duplicate({ maxRetriesPerRequest: null });

  for (const client of [publisher, subscriber]) {
    client.on("error", (error: Error) => {
      logger.error({ err: error }, "Redis adapter connection failed");
    });
  }

  io.adapter(createAdapter(publisher, subscriber));

  authenticateSockets(io);

  registerSocketServer(io);

  io.on("connection", (socket) => {
    joinRooms(socket).then(
      () => {
        socket.emit("connection:ready", { instanceId: config.INSTANCE_ID });
      },
      (error: unknown) => {
        logger.error({ err: error }, "Socket room join failed");
        socket.disconnect(true);
      },
    );
  });

  const revalidating = setInterval(() => {
    revalidateSessions(io).catch((error: unknown) => {
      logger.error({ err: error }, "Socket session revalidation failed");
    });
  }, REVALIDATION_INTERVAL_MS);

  revalidating.unref();

  io.on("close", () => {
    clearInterval(revalidating);
    unregisterSocketServer(io);
  });

  return io;
}
