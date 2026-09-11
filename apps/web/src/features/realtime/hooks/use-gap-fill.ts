import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  channelMessagesQueryKey,
  fetchNewerMessages,
  type MessageCache,
} from "@/features/messages/api/queries";
import {
  applyIncoming,
  isOptimistic,
  tombstone,
} from "@/features/messages/lib/cache";
import { socket } from "@/lib/socket";

export const GAP_FILL_INTERVAL_MS = 60_000;

export const RECOVERY_OVERLAP = 25;

function serverMessageIds(cache: MessageCache | undefined): string[] {
  return (cache?.pages ?? [])
    .flatMap((page) => page.data)
    .map((entry) => entry.id)
    .filter((id) => !isOptimistic(id))
    .sort();
}

export function recoveryCursor(
  cache: MessageCache | undefined,
  overlap = RECOVERY_OVERLAP,
): string | null {
  const known = serverMessageIds(cache);

  return known.at(-1 - overlap) ?? known.at(0) ?? null;
}

export function useGapFill(activeChannelId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    const fill = async (channelId: string): Promise<void> => {
      const key = channelMessagesQueryKey(channelId);
      const cached = serverMessageIds(
        queryClient.getQueryData<MessageCache>(key),
      );
      const from = recoveryCursor(queryClient.getQueryData<MessageCache>(key));

      if (from === null) {
        return;
      }

      const held = cached.filter((id) => id > from);
      const live = new Set<string>();
      let after: string | null = from;

      while (after !== null) {
        const page = await fetchNewerMessages(channelId, after);

        if (cancelled) {
          return;
        }

        for (const message of page.data) {
          live.add(message.id);
        }

        queryClient.setQueryData<MessageCache>(key, (cache) =>
          page.data.reduce<MessageCache | undefined>(
            (next, message) => applyIncoming(next, message, "fetch"),
            cache,
          ),
        );

        const tail = page.data.at(-1);

        after = page.nextCursor === null || tail === undefined ? null : tail.id;
      }

      const missing = new Set(held.filter((id) => !live.has(id)));

      queryClient.setQueryData<MessageCache>(key, (cache) =>
        tombstone(cache, missing, new Date().toISOString()),
      );
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
