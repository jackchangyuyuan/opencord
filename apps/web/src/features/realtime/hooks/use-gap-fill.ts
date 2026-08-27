import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  channelMessagesQueryKey,
  fetchNewerMessages,
} from "@/features/messages/api/queries";
import {
  applyIncoming,
  type MessageCache,
} from "@/features/messages/hooks/use-send-message";
import { socket } from "@/lib/socket";

export const GAP_FILL_INTERVAL_MS = 60_000;

const OPTIMISTIC_PREFIX = "optimistic:";

export function newestServerMessageId(
  cache: MessageCache | undefined,
): string | null {
  const known = (cache?.pages ?? [])
    .flatMap((page) => page.data)
    .filter((entry) => !entry.id.startsWith(OPTIMISTIC_PREFIX))
    .map((entry) => entry.id)
    .sort();

  return known.at(-1) ?? null;
}

export function useGapFill(activeChannelId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    const fill = async (channelId: string): Promise<void> => {
      const key = channelMessagesQueryKey(channelId);
      let after = newestServerMessageId(
        queryClient.getQueryData<MessageCache>(key),
      );

      while (after !== null) {
        const page = await fetchNewerMessages(channelId, after);

        if (cancelled) {
          return;
        }

        for (const message of page.data) {
          queryClient.setQueryData<MessageCache>(key, (cache) =>
            applyIncoming(cache, message),
          );
        }

        const tail = page.data.at(-1);

        after = page.nextCursor === null || tail === undefined ? null : tail.id;
      }
    };

    const openChannelIds = (): string[] =>
      queryClient
        .getQueryCache()
        .findAll({ queryKey: ["channels"] })
        .map((query) => query.queryKey)
        .filter((key) => key.length === 3 && key[2] === "messages")
        .map((key) => String(key[1]));

    const run = (channelIds: readonly string[]) => {
      for (const channelId of channelIds) {
        fill(channelId).catch(() => undefined);
      }
    };

    const fillEveryOpenChannel = () => {
      run(openChannelIds());
    };

    const fillActiveChannel = () => {
      run(activeChannelId === undefined ? [] : [activeChannelId]);
    };

    const fillWhenVisible = () => {
      if (document.visibilityState === "visible") {
        fillActiveChannel();
      }
    };

    socket.on("connect", fillEveryOpenChannel);
    window.addEventListener("focus", fillActiveChannel);
    document.addEventListener("visibilitychange", fillWhenVisible);

    const ticking = setInterval(fillWhenVisible, GAP_FILL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(ticking);
      socket.off("connect", fillEveryOpenChannel);
      window.removeEventListener("focus", fillActiveChannel);
      document.removeEventListener("visibilitychange", fillWhenVisible);
    };
  }, [activeChannelId, queryClient]);
}
