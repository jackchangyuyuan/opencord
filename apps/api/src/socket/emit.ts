import type { Message } from "@opencord/shared/types";

import { channelRoom } from "./rooms.js";
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

export function emitMessageCreate(message: Message): void {
  current?.to(channelRoom(message.channelId)).emit("message:create", {
    message,
  });
}

export function emitMessageUpdate(message: Message): void {
  current?.to(channelRoom(message.channelId)).emit("message:update", {
    message,
  });
}

export function emitMessageDelete(payload: {
  channelId: string;
  messageId: string;
  deletedAt: string;
}): void {
  current?.to(channelRoom(payload.channelId)).emit("message:delete", payload);
}
