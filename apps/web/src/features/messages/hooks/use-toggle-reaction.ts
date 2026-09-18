import type { MessageReaction } from "@opencord/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  channelMessageCaches,
  type MessageCache,
} from "@/features/messages/api/queries";
import { mapMessage } from "@/features/messages/lib/cache";
import { accountScope, isCurrentScope } from "@/lib/account-scope";
import { api, ApiError } from "@/lib/api-client";
import { inSeries } from "@/lib/serial";
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

interface PendingToggles {
  pending: number;
  confirmed: boolean;
}

const toggling = new Map<string, PendingToggles>();

function pairKey(messageId: string, emoji: string): string {
  return `${messageId} ${emoji}`;
}

function beginToggle(
  messageId: string,
  emoji: string,
  confirmed: boolean,
): void {
  const key = pairKey(messageId, emoji);
  const held = toggling.get(key);

  if (held === undefined) {
    toggling.set(key, { pending: 1, confirmed });
    return;
  }

  held.pending += 1;
}

export function noteReactionConfirmed(
  messageId: string,
  emoji: string,
  present: boolean,
): void {
  const held = toggling.get(pairKey(messageId, emoji));

  if (held !== undefined) {
    held.confirmed = present;
  }
}

function endToggle(
  messageId: string,
  emoji: string,
): { last: boolean; confirmed: boolean } {
  const key = pairKey(messageId, emoji);
  const held = toggling.get(key);

  if (held === undefined) {
    return { last: false, confirmed: false };
  }

  held.pending -= 1;

  if (held.pending > 0) {
    return { last: false, confirmed: held.confirmed };
  }

  toggling.delete(key);

  return { last: true, confirmed: held.confirmed };
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
      inSeries(pairKey(messageId, emoji), () =>
        api<unknown>(
          `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
          { method: add ? "PUT" : "DELETE" },
        ),
      ),

    onMutate: ({ messageId, emoji, add }) => {
      const held = queryClient
        .getQueriesData<MessageCache>(caches)
        .flatMap(([, cache]) => cache?.pages ?? [])
        .flatMap((page) => page.data)
        .find((entry) => entry.id === messageId);

      beginToggle(
        messageId,
        emoji,
        held?.reactions.some((entry) => entry.emoji === emoji && entry.me) ===
          true,
      );

      queryClient.setQueriesData<MessageCache>(caches, (cache) =>
        mapMessage(cache, messageId, (message) => ({
          ...message,
          reactions: applyToggle(message.reactions, emoji, add),
        })),
      );

      return { scope: accountScope() };
    },

    onSuccess: (_data, { messageId, emoji, add }) => {
      noteReactionConfirmed(messageId, emoji, add);
      endToggle(messageId, emoji);
    },

    onError: (error, { messageId, emoji }, context) => {
      const { last, confirmed } = endToggle(messageId, emoji);

      if (last && context !== undefined && isCurrentScope(context.scope)) {
        queryClient.setQueriesData<MessageCache>(caches, (cache) =>
          mapMessage(cache, messageId, (message) => ({
            ...message,
            reactions: applyToggle(message.reactions, emoji, confirmed),
          })),
        );
      }

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
