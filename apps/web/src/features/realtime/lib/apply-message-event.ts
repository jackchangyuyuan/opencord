import type { Message } from "@opencord/shared/types";

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

export type MessageEvent =
  | { type: "create"; message: Message }
  | { type: "update"; message: Message }
  | { type: "delete"; payload: DeletePayload };

function find(cache: MessageCache, messageId: string): ChatMessage | undefined {
  return cache.pages
    .flatMap((page) => page.data)
    .find((entry) => entry.id === messageId);
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

  return replace(cache, event.message.id, () => event.message);
}
