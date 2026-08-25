import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@opencord/shared/events";
import { io, type Socket } from "socket.io-client";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: AppSocket = io({
  autoConnect: false,
  transports: ["websocket"],
});
