import type { Server as HttpServer } from "node:http";

import { presenceHeartbeatSchema } from "@opencord/shared/schemas";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";

import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { heartbeatLimiter } from "../middleware/rate-limit.js";
import { redis } from "../redis.js";
import {
  authenticateSockets,
  revalidateSessions,
  REVALIDATION_INTERVAL_MS,
} from "./auth.js";
import { registerSocketServer, unregisterSocketServer } from "./emit.js";
import {
  dropConnection,
  recordHeartbeat,
  sendPresenceSnapshot,
  SWEEP_INTERVAL_MS,
  sweepPresence,
} from "./presence.js";
import { joinRooms } from "./rooms.js";
import type { AppSocket, SocketServer } from "./types.js";

const ADAPTER_REQUEST_TIMEOUT_MS = 1000;

async function initializeConnection(
  io: SocketServer,
  socket: AppSocket,
): Promise<void> {
  await joinRooms(socket);
  await recordHeartbeat(io, socket, { status: "online", idle: false });
  await sendPresenceSnapshot(socket);

  socket.emit("connection:ready", { instanceId: config.INSTANCE_ID });
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

  io.adapter(
    createAdapter(publisher, subscriber, {
      requestsTimeout: ADAPTER_REQUEST_TIMEOUT_MS,
    }),
  );

  authenticateSockets(io);

  registerSocketServer(io);

  io.on("connection", (socket) => {
    initializeConnection(io, socket).catch((error: unknown) => {
      logger.error({ err: error }, "Socket initialisation failed");
      socket.disconnect(true);
    });

    socket.on("presence:heartbeat", (payload) => {
      const parsed = presenceHeartbeatSchema.safeParse(payload);

      if (!parsed.success) {
        return;
      }

      heartbeatLimiter
        .consume(socket.id)
        .then(async (verdict) => {
          if (verdict === "abusive") {
            socket.disconnect(true);
            return;
          }

          if (verdict === "limited") {
            return;
          }

          await recordHeartbeat(io, socket, parsed.data);
        })
        .catch((error: unknown) => {
          logger.error({ err: error }, "Presence heartbeat failed");
        });
    });

    socket.on("disconnect", () => {
      dropConnection(io, socket.data.user.id, socket.id).catch(
        (error: unknown) => {
          logger.error({ err: error }, "Presence cleanup failed");
        },
      );
    });
  });

  const sweeping = setInterval(() => {
    sweepPresence(io).catch((error: unknown) => {
      logger.error({ err: error }, "Presence sweep failed");
    });
  }, SWEEP_INTERVAL_MS);

  sweeping.unref();

  const revalidating = setInterval(() => {
    revalidateSessions(io).catch((error: unknown) => {
      logger.error({ err: error }, "Socket session revalidation failed");
    });
  }, REVALIDATION_INTERVAL_MS);

  revalidating.unref();

  io.on("close", () => {
    clearInterval(sweeping);
    clearInterval(revalidating);
    unregisterSocketServer(io);
  });

  return io;
}
