import type { Message, MessageReaction } from "@opencord/shared/types";

import {
  applyIncoming,
  type ChatMessage,
  type MessageCache,
} from "@/features/messages/hooks/use-send-message";

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

function find(cache: MessageCache, messageId: string): ChatMessage | undefined {
  return cache.pages
    .flatMap((page) => page.data)
    .find((entry) => entry.id === messageId);
}

export function pinStateChanged(
  cache: MessageCache | undefined,
  message: Message,
): boolean {
  const cached = cache === undefined ? undefined : find(cache, message.id);

  return cached?.pinnedAt !== message.pinnedAt;
}

function replace(
  cache: MessageCache,
  messageId: string,
  next: (entry: ChatMessage) => ChatMessage,
): MessageCache {
  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      data: page.data.map((entry) =>
        entry.id === messageId ? next(entry) : entry,
      ),
    })),
  };
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
    const cached = find(cache, event.payload.messageId);

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
    const cached = find(cache, event.payload.messageId);

    if (cached === undefined) {
      return cache;
    }

    return replace(cache, event.payload.messageId, (entry) => ({
      ...entry,
      content: "",
      deletedAt: event.payload.deletedAt,
    }));
  }

  const cached = find(cache, event.message.id);

  if (cached?.deletedAt !== null) {
    return cache;
  }

  if (
    cached.editedAt !== null &&
    event.message.editedAt !== null &&
    Date.parse(event.message.editedAt) < Date.parse(cached.editedAt)
  ) {
    return cache;
  }

  return replace(cache, event.message.id, (entry) => ({
    ...event.message,
    reactions: entry.reactions,
    ...(entry.local === undefined ? {} : { local: entry.local }),
  }));
}
