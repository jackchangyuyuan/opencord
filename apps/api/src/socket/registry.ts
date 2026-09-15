import type { SocketServer } from "./types.js";

let current: SocketServer | null = null;

export function registerSocketServer(io: SocketServer): void {
  current = io;
}

export function unregisterSocketServer(io: SocketServer): void {
  if (current === io) {
    current = null;
  }
}

export function currentSocketServer(): SocketServer | null {
  return current;
}

export function countLocalSockets(): number {
  return current === null ? 0 : current.of("/").sockets.size;
}
