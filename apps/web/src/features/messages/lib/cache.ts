import type { MessageAttachmentInput } from "@opencord/shared/schemas";
import type { Message } from "@opencord/shared/types";

import type { MessageCache } from "@/features/messages/api/queries";

export type RetryMode = "same-nonce" | "new-nonce" | "none" | "claim";

export interface LocalState {
  status: "sending" | "failed";
  retry: RetryMode;
  reason: string | null;
  source: string;
  attachments: MessageAttachmentInput[];
}

export type ChatMessage = Message & { local?: LocalState };

export interface SendIdentity {
  authorId: string;
  nonce: string;
}

function isSameSend(entry: ChatMessage, identity: SendIdentity): boolean {
  return entry.authorId === identity.authorId && entry.nonce === identity.nonce;
}

const OPTIMISTIC_PREFIX = "optimistic:";

export function optimisticId(nonce: string): string {
  return `${OPTIMISTIC_PREFIX}${nonce}`;
}

export function isOptimistic(messageId: string): boolean {
  return messageId.startsWith(OPTIMISTIC_PREFIX);
}

function emptyCache(): MessageCache {
  return { pages: [{ data: [], nextCursor: null }], pageParams: [null] };
}

function mapPages(
  cache: MessageCache,
  map: (entries: ChatMessage[]) => ChatMessage[],
): MessageCache {
  return {
    ...cache,
    pages: cache.pages.map((page) => ({ ...page, data: map(page.data) })),
  };
}

export function mapMessage(
  cache: MessageCache | undefined,
  messageId: string,
  map: (message: ChatMessage) => ChatMessage,
): MessageCache | undefined {
  if (cache === undefined) {
    return cache;
  }

  return mapPages(cache, (entries) =>
    entries.map((entry) => (entry.id === messageId ? map(entry) : entry)),
  );
}

export function findMessage(
  cache: MessageCache | undefined,
  messageId: string,
): ChatMessage | undefined {
  return cache?.pages
    .flatMap((page) => page.data)
    .find((entry) => entry.id === messageId);
}

export function findSend(
  cache: MessageCache | undefined,
  identity: SendIdentity,
): ChatMessage | undefined {
  return cache?.pages
    .flatMap((page) => page.data)
    .find((entry) => isSameSend(entry, identity));
}

function insertionPoint(
  entries: readonly ChatMessage[],
  message: ChatMessage,
): number {
  if (isOptimistic(message.id)) {
    return 0;
  }

  const at = entries.findIndex(
    (entry) => !isOptimistic(entry.id) && entry.id < message.id,
  );

  return at === -1 ? entries.length : at;
}

export function insertOptimistic(
  cache: MessageCache | undefined,
  message: ChatMessage,
): MessageCache {
  const base = cache ?? emptyCache();
  const [first, ...rest] = base.pages;

  if (first === undefined) {
    return { ...base, pages: [{ data: [message], nextCursor: null }] };
  }

  const at = insertionPoint(first.data, message);
  const data = [...first.data.slice(0, at), message, ...first.data.slice(at)];

  return { ...base, pages: [{ ...first, data }, ...rest] };
}

function matches(entry: ChatMessage, message: Message): boolean {
  return (
    entry.id === message.id ||
    (message.nonce !== null &&
      isSameSend(entry, { authorId: message.authorId, nonce: message.nonce }))
  );
}

export function isNotStale(message: Message, entry: ChatMessage): boolean {
  if (entry.deletedAt !== null) {
    return message.deletedAt !== null;
  }

  if (entry.editedAt === null) {
    return true;
  }

  return (
    message.editedAt !== null &&
    Date.parse(message.editedAt) >= Date.parse(entry.editedAt)
  );
}

export type MessageSource = "broadcast" | "fetch";

export function applyIncoming(
  cache: MessageCache | undefined,
  message: Message,
  source: MessageSource = "broadcast",
): MessageCache {
  const base = cache ?? emptyCache();

  const known = base.pages.some((page) =>
    page.data.some((entry) => matches(entry, message)),
  );

  if (!known) {
    return insertOptimistic(base, message);
  }

  return mapPages(base, (entries) =>
    entries.map((entry) =>
      matches(entry, message) && isNotStale(message, entry)
        ? {
            ...message,
            ...(source === "broadcast" ? { reactions: entry.reactions } : {}),
          }
        : entry,
    ),
  );
}

export function tombstone(
  cache: MessageCache | undefined,
  messageIds: ReadonlySet<string>,
  deletedAt: string,
): MessageCache | undefined {
  if (cache === undefined || messageIds.size === 0) {
    return cache;
  }

  return mapPages(cache, (entries) =>
    entries.map((entry) =>
      messageIds.has(entry.id) && entry.deletedAt === null
        ? { ...entry, content: "", deletedAt }
        : entry,
    ),
  );
}

export function markLocal(
  cache: MessageCache | undefined,
  identity: SendIdentity,
  local: LocalState,
): MessageCache {
  return mapPages(cache ?? emptyCache(), (entries) =>
    entries.map((entry) =>
      isSameSend(entry, identity) ? { ...entry, local } : entry,
    ),
  );
}

export function removeSend(
  cache: MessageCache | undefined,
  identity: SendIdentity,
): MessageCache {
  return mapPages(cache ?? emptyCache(), (entries) =>
    entries.filter((entry) => !isSameSend(entry, identity)),
  );
}
