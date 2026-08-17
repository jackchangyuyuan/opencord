import type { IncomingHttpHeaders, Server as HttpServer } from "node:http";

import { createAdapter } from "@socket.io/redis-adapter";
import { fromNodeHeaders } from "better-auth/node";
import { Server } from "socket.io";

import { auth } from "../auth.js";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { redis } from "../redis.js";
import type { SocketData, SocketServer } from "./types.js";

async function resolveUser(
  headers: IncomingHttpHeaders,
): Promise<SocketData["user"] | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
    query: { disableRefresh: true },
  });

  return session?.user ?? null;
}

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

  io.use((socket, next) => {
    resolveUser(socket.handshake.headers).then(
      (user) => {
        if (user === null) {
          next(new Error("Unauthorized"));
          return;
        }

        socket.data.user = user;
        next();
      },
      (error: unknown) => {
        logger.error({ err: error }, "Socket authentication failed");
        next(new Error("Unauthorized"));
      },
    );
  });

  io.on("connection", (socket) => {
    socket.emit("connection:ready", { instanceId: config.INSTANCE_ID });
  });

  return io;
}
