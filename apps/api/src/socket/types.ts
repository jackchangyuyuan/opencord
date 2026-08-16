import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import { type DefaultEventsMap, Server } from "socket.io";

import { auth } from "../auth.js";

export interface SocketData {
  user: (typeof auth.$Infer.Session)["user"];
}

export type SocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;
