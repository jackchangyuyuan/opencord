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
  "channel:create": (p: { serverId: string; channelId: string }) => void;
  "channel:update": (p: { serverId: string; channelId: string }) => void;
  "channel:delete": (p: { serverId: string; channelId: string }) => void;
  "server:update": (p: { serverId: string }) => void;
  "server:delete": (p: { serverId: string }) => void;
  "member:join": (p: { serverId: string; userId: string }) => void;
  "member:leave": (p: { serverId: string; userId: string }) => void;
  "role:update": (p: { serverId: string }) => void;
  "permissions:changed": (p: { serverId: string }) => void;
  "session:revoked": () => void;
  "connection:ready": (p: { instanceId: string }) => void;
}
