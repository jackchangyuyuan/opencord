export type PresenceStatus = "online" | "idle" | "dnd" | "offline";

export interface MessagePreview {
  id: string;
  authorId: string;
  content: string;
  deletedAt: string | null;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  me: boolean;
}

export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  nonce: string | null;
  replyToId: string | null;
  replyTo: MessagePreview | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  reactions: MessageReaction[];
}
