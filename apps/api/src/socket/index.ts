import type { Server as HttpServer } from "node:http";

import { Server } from "socket.io";

import { config } from "../config.js";

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, { transports: ["websocket"] });

  io.on("connection", (socket) => {
    socket.emit("connection:ready", { instanceId: config.INSTANCE_ID });
  });

  return io;
}
