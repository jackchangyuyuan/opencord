import type { Message } from "./types.js";

export type ClientToServerEvents = Record<string, never>;

export interface ServerToClientEvents {
  "message:create": (p: { message: Message }) => void;
  "message:update": (p: { message: Message }) => void;
  "message:delete": (p: {
    channelId: string;
    messageId: string;
    deletedAt: string;
  }) => void;
  "connection:ready": (p: { instanceId: string }) => void;
}
