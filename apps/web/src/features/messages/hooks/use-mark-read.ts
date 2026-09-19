import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import {
  type ChannelListEntry,
  isChannelList,
  serverChannelsQuery,
} from "@/features/channels/api/queries";
import { dmsQuery } from "@/features/dms/api/queries";
import { isOptimistic } from "@/features/messages/lib/cache";
import { api } from "@/lib/api-client";
import { socket } from "@/lib/socket";

export const MARK_READ_DELAY_MS = 1_000;

export const REFRESH_COALESCE_MS = 150;

export const EVERYTHING_UNREAD = "";

const MARK_READ_RETRIES = 2;
const MARK_READ_RETRY_DELAY_MS = 500;

export interface MarkReadState {
  dividerAfterMessageId: string | null;
  boundaryKnown: boolean;
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

export function useMarkRead(
  channelId: string | undefined,
  serverId: string | null | undefined,
): MarkReadState {
  const queryClient = useQueryClient();

  const capturedRef = useRef<CapturedDivider | null>(null);
  const attemptedRef = useRef<string | null>(null);
  const confirmedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PendingRead | null>(null);
  const heldRef = useRef<PendingRead | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTargetsRef = useRef(new Set<string>());

  const refreshChannelLists = useCallback(
    (target: string) => {
      refreshTargetsRef.current.add(target);

      if (refreshTimerRef.current !== null) {
        return;
      }

      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;

        const targets = new Set(refreshTargetsRef.current);

        refreshTargetsRef.current.clear();

        void queryClient.invalidateQueries({
          predicate: (query) =>
            isChannelList(query.queryKey) &&
            (query.state.data as ChannelListEntry[] | undefined)?.some(
              (channel) => targets.has(channel.id),
            ) === true,
        });
      }, REFRESH_COALESCE_MS);
    },
    [queryClient],
  );

  const clearLocally = useCallback(
    (target: string, messageId: string) => {
      queryClient.setQueriesData<ChannelListEntry[]>(
        { predicate: (query) => isChannelList(query.queryKey) },
        (channels) =>
          channels?.map((channel) =>
            channel.id === target &&
            (channel.lastReadMessageId === null ||
              channel.lastReadMessageId < messageId)
              ? {
                  ...channel,
                  lastReadMessageId: messageId,
                  hasUnread: false,
                  hasEveryone: false,
                  mentionCount: 0,
                  unreadCount: 0,
                }
              : channel,
          ),
      );
    },
    [queryClient],
  );

  const { mutate } = useMutation({
    meta: { inline: true },
    retry: MARK_READ_RETRIES,
    retryDelay: MARK_READ_RETRY_DELAY_MS,
    mutationFn: ({ channelId: target, messageId }: PendingRead) =>
      api<unknown>(`/channels/${target}/read`, {
        method: "PUT",
        body: { messageId },
      }),

    onSuccess: (_result, { channelId: target, messageId }) => {
      if (target === channelId && (confirmedRef.current ?? "") < messageId) {
        confirmedRef.current = messageId;
      }

      refreshChannelLists(target);
    },

    onError: (_error, { channelId: target }) => {
      if (target === channelId) {
        attemptedRef.current = confirmedRef.current;
      }

      refreshChannelLists(target);
    },
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

  const channels = useQuery({
    ...serverChannelsQuery(typeof serverId === "string" ? serverId : ""),
    enabled: false,
  });
  const dms = useQuery({ ...dmsQuery, enabled: false });

  const list: ChannelListEntry[] | undefined =
    serverId === undefined
      ? undefined
      : serverId === null
        ? dms.data
        : channels.data;

  if (
    channelId !== undefined &&
    serverId !== undefined &&
    list !== undefined &&
    capturedRef.current?.channelId !== channelId
  ) {
    const entry = list.find((candidate) => candidate.id === channelId);

    capturedRef.current = {
      channelId,
      afterMessageId:
        entry?.hasUnread === true
          ? (entry.lastReadMessageId ?? EVERYTHING_UNREAD)
          : null,
    };
  }

  const captured = capturedRef.current?.channelId === channelId;

  const listFailed =
    serverId !== undefined &&
    (serverId === null ? dms.isError : channels.isError);

  useEffect(() => {
    attemptedRef.current = null;
    confirmedRef.current = null;
    heldRef.current = null;

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
    const onRead = (payload: { channelId: string }) => {
      refreshChannelLists(payload.channelId);
    };

    socket.on("read:update", onRead);

    return () => {
      socket.off("read:update", onRead);
    };
  }, [refreshChannelLists]);

  useEffect(
    () => () => {
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
      }
    },
    [],
  );

  const markRead = useCallback(
    (messageId: string) => {
      if (channelId === undefined || isOptimistic(messageId)) {
        return;
      }

      if (!captured) {
        if (
          heldRef.current === null ||
          heldRef.current.messageId < messageId ||
          heldRef.current.channelId !== channelId
        ) {
          heldRef.current = { channelId, messageId };
        }

        return;
      }

      if (attemptedRef.current !== null && messageId <= attemptedRef.current) {
        return;
      }

      attemptedRef.current = messageId;
      pendingRef.current = { channelId, messageId };
      clearLocally(channelId, messageId);

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(flush, MARK_READ_DELAY_MS);
    },
    [captured, channelId, clearLocally, flush],
  );

  useEffect(() => {
    const held = heldRef.current;

    if (!captured || held === null || held.channelId !== channelId) {
      return;
    }

    heldRef.current = null;
    markRead(held.messageId);
  }, [captured, channelId, markRead]);

  return {
    dividerAfterMessageId: capturedRef.current?.afterMessageId ?? null,
    boundaryKnown: captured || listFailed,
    markRead,
  };
}
