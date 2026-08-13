import type { Server as HttpServer } from "node:http";

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import { Server } from "socket.io";

import { config } from "../config.js";

export function createSocketServer(
  httpServer: HttpServer,
): Server<ClientToServerEvents, ServerToClientEvents> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    { transports: ["websocket"] },
  );

  io.on("connection", (socket) => {
    socket.emit("connection:ready", { instanceId: config.INSTANCE_ID });
  });

  return io;
}
