import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import type { Server, Socket } from "socket.io";

import type { SessionUser } from "../auth.js";

export interface SocketData {
  user: SessionUser;
  sessionId: string;
}

export type RoomSyncRequest =
  { scope: "users"; userIds: string[] } | { scope: "server"; serverId: string };

export interface InterServerEvents {
  "rooms:sync": (request: RoomSyncRequest) => void;
  "rooms:revoke": (
    request: RoomSyncRequest,
    applied: (converged: boolean) => void,
  ) => void;
}

export type SocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
