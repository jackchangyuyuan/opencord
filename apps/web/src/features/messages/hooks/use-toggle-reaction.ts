import type { MessageReaction } from "@opencord/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  channelMessageCaches,
  type MessageCache,
} from "@/features/messages/api/queries";
import { mapMessage } from "@/features/messages/lib/cache";
import { api, ApiError } from "@/lib/api-client";
import { chatAlert } from "@/lib/toast";

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

export interface ToggleReactionState {
  toggle: (input: ToggleInput) => void;
}

export function useToggleReaction(channelId: string): ToggleReactionState {
  const queryClient = useQueryClient();

  const caches = channelMessageCaches(channelId);

  const { mutate } = useMutation({
    meta: { inline: true },
    mutationFn: ({ messageId, emoji, add }: ToggleInput) =>
      api<unknown>(
        `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
        { method: add ? "PUT" : "DELETE" },
      ),

    onMutate: ({ messageId, emoji, add }) => {
      queryClient.setQueriesData<MessageCache>(caches, (cache) =>
        mapMessage(cache, messageId, (message) => ({
          ...message,
          reactions: applyToggle(message.reactions, emoji, add),
        })),
      );
    },

    onError: (error, { messageId, emoji, add }) => {
      queryClient.setQueriesData<MessageCache>(caches, (cache) =>
        mapMessage(cache, messageId, (message) => ({
          ...message,
          reactions: applyToggle(message.reactions, emoji, !add),
        })),
      );

      chatAlert(messageFor(error));
    },
  });

  const toggle = useCallback(
    (input: ToggleInput) => {
      mutate(input);
    },
    [mutate],
  );

  return { toggle };
}

function messageFor(error: Error): string {
  if (error instanceof ApiError && error.code === "FORBIDDEN") {
    return "You cannot react in this channel";
  }

  return error instanceof ApiError ? error.message : "Could not react";
}
