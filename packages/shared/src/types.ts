export interface Message {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  nonce: string | null;
  replyToId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}
