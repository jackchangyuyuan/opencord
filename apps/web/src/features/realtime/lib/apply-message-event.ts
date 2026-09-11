import type {
  Message,
  MessagePreview,
  MessageReaction,
} from "@opencord/shared/types";

import type { MessageCache } from "@/features/messages/api/queries";
import {
  applyIncoming,
  type ChatMessage,
  findMessage,
  isNotStale,
} from "@/features/messages/lib/cache";

export interface DeletePayload {
  channelId: string;
  messageId: string;
  deletedAt: string;
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
  | {
      type: "reaction";
      add: boolean;
      payload: ReactionPayload;
      viewerId: string | null;
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

export function pinStateChanged(
  cache: MessageCache | undefined,
  message: Message,
): boolean {
  const cached = findMessage(cache, message.id);

  return cached?.pinnedAt !== message.pinnedAt;
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

      return entry.deletedAt === null
        ? { ...entry, content: "", deletedAt }
        : entry;
    });
  }

  const cached = findMessage(cache, event.message.id);
  const fresh = cached !== undefined && isNotStale(event.message, cached);

  return mapEntries(cache, (entry) => {
    if (entry.id !== event.message.id) {
      return requote(entry, event.message.id, (quoted) =>
        quoted.deletedAt === null
          ? { ...quoted, content: event.message.content }
          : quoted,
      );
    }

    return fresh
      ? {
          ...event.message,
          reactions: entry.reactions,
          ...(entry.local === undefined ? {} : { local: entry.local }),
        }
      : entry;
  });
}
