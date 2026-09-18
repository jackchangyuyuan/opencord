import type { MessageAttachmentInput } from "@opencord/shared/schemas";
import type { Message, MessagePreview } from "@opencord/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useSyncExternalStore } from "react";

import {
  channelMessagesQueryKey,
  type MessageCache,
} from "@/features/messages/api/queries";
import {
  applyIncoming,
  type ChatMessage,
  findSend,
  insertOptimistic,
  type LocalState,
  markPendingSend,
  optimisticId,
  removeSend,
  type SendIdentity,
} from "@/features/messages/lib/cache";
import { accountScope, isCurrentScope } from "@/lib/account-scope";
import { api, ApiError } from "@/lib/api-client";

const NONCE_REUSED = "NONCE_REUSED";
const GUEST_QUOTA_REACHED = "GUEST_QUOTA_REACHED";
const RATE_LIMITED = "RATE_LIMITED";

let blockedUntilMs = 0;

const blockedListeners = new Set<() => void>();

function setBlockedUntil(at: number): void {
  blockedUntilMs = at;

  for (const listener of blockedListeners) {
    listener();
  }
}

export function resetSendBlock(): void {
  setBlockedUntil(0);
}

export function useRateLimited(): boolean {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useSyncExternalStore(
    (onChange) => {
      const wake = () => {
        onChange();

        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }

        const left = blockedUntilMs - Date.now();

        if (left > 0) {
          timerRef.current = setTimeout(wake, left);
        }
      };

      blockedListeners.add(wake);
      wake();

      return () => {
        blockedListeners.delete(wake);

        if (timerRef.current !== null) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
      };
    },
    () => blockedUntilMs > Date.now(),
    () => false,
  );
}

export function newNonce(): string {
  return crypto.randomUUID();
}

function failureFor(error: unknown, sent: SendInput): LocalState {
  const draft = { source: sent.content, attachments: sent.attachments ?? [] };

  if (error instanceof ApiError && error.code === NONCE_REUSED) {
    return {
      status: "failed",
      retry: "new-nonce",
      reason: "That message was already sent",
      ...draft,
    };
  }

  if (error instanceof ApiError && error.code === GUEST_QUOTA_REACHED) {
    return {
      status: "failed",
      retry: "claim",
      reason: "Your guest message allowance is used up",
      ...draft,
    };
  }

  if (error instanceof ApiError && error.code === RATE_LIMITED) {
    setBlockedUntil(Date.now() + ((error.retryAfterSeconds ?? 5) + 1) * 1000);
  }

  return {
    status: "failed",
    retry: "same-nonce",
    reason: error instanceof ApiError ? error.message : "Could not send",
    ...draft,
  };
}

export interface SendInput {
  content: string;
  optimisticContent?: string;
  nonce: string;
  authorId: string;
  replyToId?: string;
  replyTo?: MessagePreview;
  attachments?: MessageAttachmentInput[];
}

export function useSendMessage(channelId: string) {
  const queryClient = useQueryClient();

  const update = useCallback(
    (map: (cache: MessageCache | undefined) => MessageCache) => {
      queryClient.setQueryData<MessageCache>(
        channelMessagesQueryKey(channelId),
        map,
      );
    },
    [channelId, queryClient],
  );

  const { mutate, isPending } = useMutation({
    meta: { inline: true },
    mutationFn: ({ content, nonce, replyToId, attachments }: SendInput) =>
      api<Message>(`/channels/${channelId}/messages`, {
        method: "POST",
        body: {
          content,
          nonce,
          ...(replyToId === undefined ? {} : { replyToId }),
          ...(attachments === undefined || attachments.length === 0
            ? {}
            : { attachments }),
        },
      }),

    onMutate: (input: SendInput) => {
      const {
        content,
        optimisticContent,
        nonce,
        authorId,
        replyToId,
        replyTo,
      } = input;
      const identity: SendIdentity = { authorId, nonce };

      const existing = findSend(
        queryClient.getQueryData<MessageCache>(
          channelMessagesQueryKey(channelId),
        ),
        identity,
      );

      const sending: LocalState = {
        status: "sending",
        retry: "same-nonce",
        reason: null,
        source: content,
        attachments: input.attachments ?? [],
      };

      if (existing === undefined) {
        update((cache) =>
          insertOptimistic(cache, {
            id: optimisticId(nonce),
            channelId,
            authorId,
            content: optimisticContent ?? content,
            nonce,
            replyToId: replyToId ?? null,
            replyTo: replyTo ?? null,
            pinnedAt: null,
            pinnedBy: null,
            editedAt: null,
            deletedAt: null,
            createdAt: new Date().toISOString(),
            reactions: [],
            attachments: [],
            local: sending,
          }),
        );
      } else {
        update((cache) => markPendingSend(cache, identity, sending));
      }

      return { scope: accountScope() };
    },

    onSuccess: (message, _input, context) => {
      if (isCurrentScope(context.scope)) {
        update((cache) => applyIncoming(cache, message));
      }
    },

    onError: (error, input, context) => {
      if (context === undefined || !isCurrentScope(context.scope)) {
        return;
      }

      update((cache) =>
        markPendingSend(
          cache,
          { authorId: input.authorId, nonce: input.nonce },
          failureFor(error, input),
        ),
      );
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
      const mode = entry.local?.retry;

      if (nonce === null || (mode !== "same-nonce" && mode !== "new-nonce")) {
        return;
      }

      const content = entry.local?.source ?? entry.content;
      const optimistic = { optimisticContent: entry.content };
      const attachments = entry.local?.attachments ?? [];

      const replyTo =
        entry.replyToId === null
          ? {}
          : {
              replyToId: entry.replyToId,
              ...(entry.replyTo === null ? {} : { replyTo: entry.replyTo }),
            };

      const again = {
        content,
        ...optimistic,
        authorId,
        ...replyTo,
        ...(attachments.length === 0 ? {} : { attachments }),
      };

      if (mode === "new-nonce") {
        update((cache) => removeSend(cache, { authorId, nonce }));
        mutate({ ...again, nonce: newNonce() });
        return;
      }

      mutate({ ...again, nonce });
    },
    [mutate, update],
  );

  const discard = useCallback(
    (entry: ChatMessage) => {
      const nonce = entry.nonce;

      if (nonce !== null) {
        update((cache) =>
          removeSend(cache, { authorId: entry.authorId, nonce }),
        );
      }
    },
    [update],
  );

  return { send, retry, discard, isPending };
}
