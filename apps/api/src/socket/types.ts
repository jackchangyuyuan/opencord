import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import { type DefaultEventsMap, Server, type Socket } from "socket.io";

import { type SessionUser } from "../auth.js";

export interface SocketData {
  user: SessionUser;
  sessionId: string;
}

export type SocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;
