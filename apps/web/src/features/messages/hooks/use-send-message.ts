import type { Message } from "@opencord/shared/types";
import {
  type InfiniteData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";

import {
  channelMessagesQueryKey,
  type MessagePage,
} from "@/features/messages/api/queries";
import { api, ApiError } from "@/lib/api-client";

export type RetryMode = "same-nonce" | "new-nonce" | "none";

export interface LocalState {
  status: "sending" | "failed";
  retry: RetryMode;
  reason: string | null;
}

export type ChatMessage = Message & { local?: LocalState };

export type MessageCache = InfiniteData<MessagePage, string | null>;

const NONCE_REUSED = "NONCE_REUSED";
const GUEST_QUOTA_REACHED = "GUEST_QUOTA_REACHED";

export function newNonce(): string {
  return crypto.randomUUID();
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

export function findByNonce(
  cache: MessageCache | undefined,
  nonce: string,
): ChatMessage | undefined {
  return cache?.pages
    .flatMap((page) => page.data)
    .find((entry) => entry.nonce === nonce);
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

function matches(entry: ChatMessage, message: Message): boolean {
  return (
    entry.id === message.id ||
    (message.nonce !== null && entry.nonce === message.nonce)
  );
}

export function applyIncoming(
  cache: MessageCache | undefined,
  message: Message,
): MessageCache {
  const base = cache ?? emptyCache();

  const known = base.pages.some((page) =>
    page.data.some((entry) => matches(entry, message)),
  );

  if (!known) {
    return insertOptimistic(base, message);
  }

  return mapPages(base, (entries) =>
    entries.map((entry) => (matches(entry, message) ? message : entry)),
  );
}

export function markLocal(
  cache: MessageCache | undefined,
  nonce: string,
  local: LocalState,
): MessageCache {
  return mapPages(cache ?? emptyCache(), (entries) =>
    entries.map((entry) =>
      entry.nonce === nonce ? { ...entry, local } : entry,
    ),
  );
}

export function removeByNonce(
  cache: MessageCache | undefined,
  nonce: string,
): MessageCache {
  return mapPages(cache ?? emptyCache(), (entries) =>
    entries.filter((entry) => entry.nonce !== nonce),
  );
}

function failureFor(error: unknown): LocalState {
  if (error instanceof ApiError && error.code === NONCE_REUSED) {
    return {
      status: "failed",
      retry: "new-nonce",
      reason: "That message was already sent",
    };
  }

  if (error instanceof ApiError && error.code === GUEST_QUOTA_REACHED) {
    return {
      status: "failed",
      retry: "none",
      reason: "Save your account to keep sending",
    };
  }

  return {
    status: "failed",
    retry: "same-nonce",
    reason: error instanceof ApiError ? error.message : "Could not send",
  };
}

export interface SendInput {
  content: string;
  nonce: string;
  authorId: string;
  replyToId?: string;
}

export function useSendMessage(channelId: string) {
  const queryClient = useQueryClient();
  const key = channelMessagesQueryKey(channelId);

  const update = useCallback(
    (map: (cache: MessageCache | undefined) => MessageCache) => {
      queryClient.setQueryData<MessageCache>(key, map);
    },
    [key, queryClient],
  );

  const { mutate, isPending } = useMutation({
    mutationFn: ({ content, nonce, replyToId }: SendInput) =>
      api<Message>(`/channels/${channelId}/messages`, {
        method: "POST",
        body: {
          content,
          nonce,
          ...(replyToId === undefined ? {} : { replyToId }),
        },
      }),

    onMutate: ({ content, nonce, authorId, replyToId }: SendInput) => {
      const existing = findByNonce(
        queryClient.getQueryData<MessageCache>(key),
        nonce,
      );

      const sending: LocalState = {
        status: "sending",
        retry: "same-nonce",
        reason: null,
      };

      if (existing === undefined) {
        update((cache) =>
          insertOptimistic(cache, {
            id: `optimistic:${nonce}`,
            channelId,
            authorId,
            content,
            nonce,
            replyToId: replyToId ?? null,
            replyTo: null,
            pinnedAt: null,
            pinnedBy: null,
            editedAt: null,
            deletedAt: null,
            createdAt: new Date().toISOString(),
            reactions: [],
            local: sending,
          }),
        );
      } else {
        update((cache) => markLocal(cache, nonce, sending));
      }
    },

    onSuccess: (message) => {
      update((cache) => applyIncoming(cache, message));
    },

    onError: (error, { nonce }) => {
      update((cache) => markLocal(cache, nonce, failureFor(error)));
    },
  });

  const send = useCallback(
    (input: SendInput) => {
      mutate(input);
    },
    [mutate],
  );

  const retry = useCallback(
    (entry: ChatMessage, authorId: string) => {
      const nonce = entry.nonce;

      if (nonce === null || entry.local?.retry === "none") {
        return;
      }

      const replyTo =
        entry.replyToId === null ? {} : { replyToId: entry.replyToId };

      if (entry.local?.retry === "new-nonce") {
        update((cache) => removeByNonce(cache, nonce));
        mutate({
          content: entry.content,
          nonce: newNonce(),
          authorId,
          ...replyTo,
        });
        return;
      }

      mutate({ content: entry.content, nonce, authorId, ...replyTo });
    },
    [mutate, update],
  );

  const discard = useCallback(
    (entry: ChatMessage) => {
      const nonce = entry.nonce;

      if (nonce !== null) {
        update((cache) => removeByNonce(cache, nonce));
      }
    },
    [update],
  );

  return { send, retry, discard, isPending };
}
