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
import { handleTypingStart } from "./typing.js";

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

export interface SocketService {
  io: SocketServer;
  close: () => Promise<void>;
}

export async function createSocketServer(
  httpServer: HttpServer,
): Promise<SocketService> {
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

  // Connected before the adapter is built, because the adapter subscribes from
  // its constructor and keeps none of the promises. `duplicate()` inherits
  // lazyConnect, so on an unconnected client those subscriptions sit in
  // ioredis's offline queue -- and closing a client whose offline queue is not
  // empty rejects every command in it, with nobody left holding them. A
  // connected client takes them straight to the stream, and a Redis that
  // cannot be reached fails the boot here rather than silently.
  await Promise.all([publisher.connect(), subscriber.connect()]);

  io.adapter(
    createAdapter(publisher, subscriber, {
      requestsTimeout: ADAPTER_REQUEST_TIMEOUT_MS,
    }),
  );

  authenticateSockets(io);

  registerSocketServer(io);

  const leaving = new Set<Promise<unknown>>();

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

    socket.on("typing:start", (payload) => {
      handleTypingStart(socket, payload).catch((error: unknown) => {
        logger.error({ err: error }, "Typing indicator failed");
      });
    });

    socket.on("disconnect", () => {
      const dropped = dropConnection(io, socket.data.user.id, socket.id).catch(
        (error: unknown) => {
          logger.error({ err: error }, "Presence cleanup failed");
        },
      );

      leaving.add(dropped);

      void dropped.finally(() => leaving.delete(dropped));
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

  let closing: Promise<void> | null = null;

  const close = (): Promise<void> => {
    closing ??= (async () => {
      clearInterval(sweeping);
      clearInterval(revalidating);

      unregisterSocketServer(io);

      await io.close();
      await Promise.allSettled([...leaving]);

      await Promise.all([publisher.quit(), subscriber.quit()]);
    })();

    return closing;
  };

  return { io, close };
}
