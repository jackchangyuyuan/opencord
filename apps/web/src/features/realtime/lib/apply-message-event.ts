import type {
  Message,
  MessagePreview,
  MessageReaction,
} from "@opencord/shared/types";

import type { MessageCache } from "@/features/messages/api/queries";
import {
  applyIncoming,
  carriesNewerContent,
  type ChatMessage,
  confirmDeleted,
  findMessage,
  mergeIncoming,
} from "@/features/messages/lib/cache";

export interface DeletePayload {
  channelId: string;
  messageId: string;
  deletedAt: string;
}

export interface PinPayload {
  channelId: string;
  messageId: string;
  pinnedAt: string | null;
  pinnedBy: string | null;
}

export interface ReactionPayload {
  channelId: string;
  messageId: string;
  userId: string;
  emoji: string;
}

export type MessageEvent =
  | { type: "create"; message: Message }
  | { type: "update"; message: Message }
  | { type: "delete"; payload: DeletePayload }
  | { type: "pin"; payload: PinPayload }
  | {
      type: "reaction";
      add: boolean;
      payload: ReactionPayload;
      viewerId: string | null;
      at: number;
    };

export function applyReaction(
  reactions: readonly MessageReaction[],
  emoji: string,
  add: boolean,
  mine: boolean,
): MessageReaction[] {
  const existing = reactions.find((entry) => entry.emoji === emoji);

  if (add) {
    return existing === undefined
      ? [...reactions, { emoji, count: 1, me: mine }]
      : reactions.map((entry) =>
          entry.emoji === emoji
            ? { ...entry, count: entry.count + 1, me: entry.me || mine }
            : entry,
        );
  }

  if (existing === undefined) {
    return [...reactions];
  }

  return reactions
    .map((entry) =>
      entry.emoji === emoji
        ? {
            ...entry,
            count: entry.count - 1,
            me: mine ? false : entry.me,
          }
        : entry,
    )
    .filter((entry) => entry.count > 0);
}

function mapEntries(
  cache: MessageCache,
  next: (entry: ChatMessage) => ChatMessage,
): MessageCache {
  return {
    ...cache,
    pages: cache.pages.map((page) => ({ ...page, data: page.data.map(next) })),
  };
}

function replace(
  cache: MessageCache,
  messageId: string,
  next: (entry: ChatMessage) => ChatMessage,
): MessageCache {
  return mapEntries(cache, (entry) =>
    entry.id === messageId ? next(entry) : entry,
  );
}

function requote(
  entry: ChatMessage,
  messageId: string,
  next: (quoted: MessagePreview) => MessagePreview,
): ChatMessage {
  if (entry.replyTo?.id !== messageId) {
    return entry;
  }

  const quoted = next(entry.replyTo);

  return quoted === entry.replyTo ? entry : { ...entry, replyTo: quoted };
}

export function applyMessageEvent(
  cache: MessageCache | undefined,
  event: MessageEvent,
): MessageCache | undefined {
  if (event.type === "create") {
    return applyIncoming(cache, event.message);
  }

  if (cache === undefined) {
    return cache;
  }

  if (event.type === "pin") {
    const { messageId, pinnedAt, pinnedBy } = event.payload;

    return replace(cache, messageId, (entry) => ({
      ...entry,
      pinnedAt,
      pinnedBy,
    }));
  }

  if (event.type === "reaction") {
    const cached = findMessage(cache, event.payload.messageId);

    if (cached === undefined) {
      return cache;
    }

    const mine = event.payload.userId === event.viewerId;

    if (
      mine &&
      cached.reactions.some(
        (entry) => entry.emoji === event.payload.emoji && entry.me,
      ) === event.add
    ) {
      return cache;
    }

    return replace(cache, event.payload.messageId, (entry) => ({
      ...entry,
      reactions: applyReaction(
        entry.reactions,
        event.payload.emoji,
        event.add,
        mine,
      ),
      reactionsAt: event.at,
    }));
  }

  if (event.type === "delete") {
    const { messageId, deletedAt } = event.payload;

    return mapEntries(cache, (entry) => {
      if (entry.id !== messageId) {
        return requote(entry, messageId, (quoted) =>
          quoted.deletedAt === null
            ? { ...quoted, content: "", deletedAt }
            : quoted,
        );
      }

      return entry.deletedAt !== null && entry.pendingDelete === undefined
        ? entry
        : confirmDeleted(entry, deletedAt);
    });
  }

  const cached = findMessage(cache, event.message.id);
  const fresh =
    cached === undefined || carriesNewerContent(event.message, cached);

  return mapEntries(cache, (entry) => {
    if (entry.id !== event.message.id) {
      return fresh
        ? requote(entry, event.message.id, (quoted) =>
            quoted.deletedAt === null
              ? { ...quoted, content: event.message.content }
              : quoted,
          )
        : entry;
    }

    return fresh ? mergeIncoming(entry, event.message) : entry;
  });
}
