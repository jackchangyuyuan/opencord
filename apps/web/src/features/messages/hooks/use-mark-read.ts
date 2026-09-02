import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import {
  type ChannelListEntry,
  isChannelList,
} from "@/features/channels/api/queries";
import { api } from "@/lib/api-client";
import { socket } from "@/lib/socket";

export const MARK_READ_DELAY_MS = 1_000;

export interface MarkReadState {
  dividerAfterMessageId: string | null;
  markRead: (messageId: string) => void;
}

interface PendingRead {
  channelId: string;
  messageId: string;
}

interface CapturedDivider {
  channelId: string;
  afterMessageId: string | null;
}

export function useMarkRead(channelId: string | undefined): MarkReadState {
  const queryClient = useQueryClient();

  const capturedRef = useRef<CapturedDivider | null>(null);
  const highestRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PendingRead | null>(null);

  const refreshChannelLists = useCallback(() => {
    void queryClient.invalidateQueries({
      predicate: (query) => isChannelList(query.queryKey),
    });
  }, [queryClient]);

  const { mutate } = useMutation({
    mutationFn: ({ channelId: target, messageId }: PendingRead) =>
      api<unknown>(`/channels/${target}/read`, {
        method: "PUT",
        body: { messageId },
      }),

    onSuccess: refreshChannelLists,
  });

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const read = pendingRef.current;

    pendingRef.current = null;

    if (read !== null) {
      mutate(read);
    }
  }, [mutate]);

  if (channelId !== undefined && capturedRef.current?.channelId !== channelId) {
    const entry = queryClient
      .getQueriesData<ChannelListEntry[]>({
        predicate: (query) => isChannelList(query.queryKey),
      })
      .flatMap(([, data]) => data ?? [])
      .find((channel) => channel.id === channelId);

    capturedRef.current = {
      channelId,
      afterMessageId:
        entry?.hasUnread === true ? entry.lastReadMessageId : null,
    };
  }

  useEffect(() => {
    highestRef.current = null;

    return flush;
  }, [channelId, flush]);

  useEffect(() => {
    const onVisibilityChange = () => {
      flush();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [flush]);

  useEffect(() => {
    socket.on("read:update", refreshChannelLists);

    return () => {
      socket.off("read:update", refreshChannelLists);
    };
  }, [refreshChannelLists]);

  const markRead = useCallback(
    (messageId: string) => {
      if (channelId === undefined || messageId.startsWith("optimistic:")) {
        return;
      }

      if (highestRef.current !== null && messageId <= highestRef.current) {
        return;
      }

      highestRef.current = messageId;
      pendingRef.current = { channelId, messageId };

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(flush, MARK_READ_DELAY_MS);
    },
    [channelId, flush],
  );

  return {
    dividerAfterMessageId: capturedRef.current?.afterMessageId ?? null,
    markRead,
  };
}
