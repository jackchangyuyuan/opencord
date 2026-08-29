import type { Message, MessageReaction } from "@opencord/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { channelMessageCaches } from "@/features/messages/api/queries";
import type { MessageCache } from "@/features/messages/hooks/use-send-message";
import { api, ApiError } from "@/lib/api-client";

export interface ToggleInput {
  messageId: string;
  emoji: string;
  add: boolean;
}

export function applyToggle(
  reactions: readonly MessageReaction[],
  emoji: string,
  add: boolean,
): MessageReaction[] {
  const existing = reactions.find((entry) => entry.emoji === emoji);

  if (add) {
    if (existing?.me === true) {
      return [...reactions];
    }

    return existing === undefined
      ? [...reactions, { emoji, count: 1, me: true }]
      : reactions.map((entry) =>
          entry.emoji === emoji
            ? { ...entry, count: entry.count + 1, me: true }
            : entry,
        );
  }

  if (existing?.me !== true) {
    return [...reactions];
  }

  return reactions
    .map((entry) =>
      entry.emoji === emoji
        ? { ...entry, count: entry.count - 1, me: false }
        : entry,
    )
    .filter((entry) => entry.count > 0);
}

function mapMessage(
  cache: MessageCache | undefined,
  messageId: string,
  map: (message: Message) => Message,
): MessageCache | undefined {
  if (cache === undefined) {
    return cache;
  }

  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      data: page.data.map((entry) =>
        entry.id === messageId ? { ...entry, ...map(entry) } : entry,
      ),
    })),
  };
}

export interface ToggleReactionState {
  toggle: (input: ToggleInput) => void;
  error: string | null;
}

export function useToggleReaction(channelId: string): ToggleReactionState {
  const queryClient = useQueryClient();

  const caches = channelMessageCaches(channelId);

  const { mutate, error } = useMutation({
    meta: { inline: true },
    mutationFn: ({ messageId, emoji, add }: ToggleInput) =>
      api<unknown>(
        `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
        { method: add ? "PUT" : "DELETE" },
      ),

    onMutate: ({ messageId, emoji, add }) => {
      const previous = queryClient.getQueriesData<MessageCache>(caches);

      queryClient.setQueriesData<MessageCache>(caches, (cache) =>
        mapMessage(cache, messageId, (message) => ({
          ...message,
          reactions: applyToggle(message.reactions, emoji, add),
        })),
      );

      return { previous };
    },

    onError: (_error, _input, context) => {
      for (const [queryKey, cache] of context?.previous ?? []) {
        queryClient.setQueryData<MessageCache>(queryKey, cache);
      }
    },
  });

  const toggle = useCallback(
    (input: ToggleInput) => {
      mutate(input);
    },
    [mutate],
  );

  return {
    toggle,
    error: error === null ? null : messageFor(error),
  };
}

function messageFor(error: Error): string {
  if (error instanceof ApiError && error.code === "FORBIDDEN") {
    return "You cannot react in this channel";
  }

  return error instanceof ApiError ? error.message : "Could not react";
}
