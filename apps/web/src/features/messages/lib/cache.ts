import type { MessageAttachmentInput } from "@opencord/shared/schemas";
import type { Message } from "@opencord/shared/types";

import type {
  MessageCache,
  MessagePage,
} from "@/features/messages/api/queries";

export type RetryMode = "same-nonce" | "new-nonce" | "none" | "claim";

export interface LocalState {
  status: "sending" | "failed";
  retry: RetryMode;
  reason: string | null;
  source: string;
  attachments: MessageAttachmentInput[];
}

export type ChatMessage = Message & {
  local?: LocalState;
  pendingDelete?: string;
  reactionsAt?: number;
};

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

function insertionPoint(entries: readonly ChatMessage[], id: string): number {
  const at = entries.findIndex(
    (entry) => !isOptimistic(entry.id) && entry.id < id,
  );

  return at === -1 ? entries.length : at;
}

function oldestServerId(entries: readonly ChatMessage[]): string | undefined {
  for (let at = entries.length - 1; at >= 0; at -= 1) {
    const entry = entries[at];

    if (entry !== undefined && !isOptimistic(entry.id)) {
      return entry.id;
    }
  }

  return undefined;
}

function pageFor(
  pages: readonly MessagePage[],
  messageId: string,
): number | null {
  for (const [index, page] of pages.entries()) {
    const oldest = oldestServerId(page.data);

    if (oldest === undefined || oldest < messageId) {
      return index;
    }
  }

  const last = pages.length - 1;

  return pages[last]?.nextCursor === null ? last : null;
}

export function insertInOrder(
  cache: MessageCache | undefined,
  message: ChatMessage,
): MessageCache {
  const base = cache ?? emptyCache();
  const index = pageFor(base.pages, message.id);

  if (index === null) {
    return base;
  }

  return {
    ...base,
    pages: base.pages.map((page, at) => {
      if (at !== index) {
        return page;
      }

      const point = insertionPoint(page.data, message.id);

      return {
        ...page,
        data: [
          ...page.data.slice(0, point),
          message,
          ...page.data.slice(point),
        ],
      };
    }),
  };
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

  return {
    ...base,
    pages: [{ ...first, data: [message, ...first.data] }, ...rest],
  };
}

function dropEntry(cache: MessageCache, messageId: string): MessageCache {
  return mapPages(cache, (entries) =>
    entries.filter((entry) => entry.id !== messageId),
  );
}

function matches(entry: ChatMessage, message: Message): boolean {
  return (
    entry.id === message.id ||
    (message.nonce !== null &&
      isSameSend(entry, { authorId: message.authorId, nonce: message.nonce }))
  );
}

function findMatch(
  cache: MessageCache,
  message: Message,
): ChatMessage | undefined {
  return cache.pages
    .flatMap((page) => page.data)
    .find((entry) => matches(entry, message));
}

export function carriesNewerContent(
  message: Message,
  entry: ChatMessage,
): boolean {
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

export interface IncomingOptions {
  source?: MessageSource;
  askedAt?: number;
}

export function mergeIncoming(
  held: ChatMessage,
  message: Message,
  options: IncomingOptions = {},
): ChatMessage {
  const { source = "broadcast", askedAt } = options;

  const outpaced =
    askedAt !== undefined &&
    held.reactionsAt !== undefined &&
    held.reactionsAt > askedAt;

  return {
    ...message,
    ...(source === "broadcast" || outpaced
      ? { reactions: held.reactions }
      : {}),
    ...(held.reactionsAt === undefined
      ? {}
      : { reactionsAt: held.reactionsAt }),
    ...(source === "broadcast"
      ? { pinnedAt: held.pinnedAt, pinnedBy: held.pinnedBy }
      : {}),
    ...(held.local === undefined ? {} : { local: held.local }),
    ...(held.pendingDelete === undefined
      ? {}
      : { pendingDelete: held.pendingDelete }),
  };
}

export function applyIncoming(
  cache: MessageCache | undefined,
  message: Message,
  options: IncomingOptions = {},
): MessageCache {
  const base = cache ?? emptyCache();
  const held = findMatch(base, message);

  if (held === undefined) {
    return insertInOrder(base, message);
  }

  if (held.id !== message.id) {
    const without = dropEntry(base, held.id);
    const placed = insertInOrder(without, message);

    return placed === without ? insertOptimistic(without, message) : placed;
  }

  if (!carriesNewerContent(message, held)) {
    return base;
  }

  return mapPages(base, (entries) =>
    entries.map((entry) =>
      entry.id === message.id ? mergeIncoming(held, message, options) : entry,
    ),
  );
}

export function confirmDeleted(
  entry: ChatMessage,
  deletedAt: string,
): ChatMessage {
  const rest = { ...entry };

  delete rest.pendingDelete;

  return { ...rest, content: "", deletedAt };
}

export function restoreDeleted(
  entry: ChatMessage,
  replaced: { content: string; deletedAt: string | null },
): ChatMessage {
  const rest = { ...entry };

  delete rest.pendingDelete;

  return { ...rest, ...replaced };
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
      messageIds.has(entry.id) &&
      (entry.deletedAt === null || entry.pendingDelete !== undefined)
        ? confirmDeleted(entry, deletedAt)
        : entry,
    ),
  );
}

export function markPendingSend(
  cache: MessageCache | undefined,
  identity: SendIdentity,
  local: LocalState,
): MessageCache {
  return mapPages(cache ?? emptyCache(), (entries) =>
    entries.map((entry) =>
      isSameSend(entry, identity) && isOptimistic(entry.id)
        ? { ...entry, local }
        : entry,
    ),
  );
}

export function removeSend(
  cache: MessageCache | undefined,
  identity: SendIdentity,
): MessageCache {
  return mapPages(cache ?? emptyCache(), (entries) =>
    entries.filter(
      (entry) => !(isSameSend(entry, identity) && isOptimistic(entry.id)),
    ),
  );
}
