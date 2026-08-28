import type { Message, PresenceStatus } from "./types.js";

export interface ClientToServerEvents {
  "presence:heartbeat": (p: { status: PresenceStatus; idle: boolean }) => void;
  "typing:start": (p: { channelId: string }) => void;
}

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
  "typing:start": (p: { channelId: string; userId: string }) => void;
  "presence:update": (p: { userId: string; status: PresenceStatus }) => void;
  "permissions:changed": (p: { serverId: string }) => void;
  "read:update": (p: { channelId: string; lastReadMessageId: string }) => void;
  "session:revoked": () => void;
  "system:reconnect": () => void;
  "connection:ready": (p: { instanceId: string }) => void;
}
