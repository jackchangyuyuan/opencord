import type { Message } from "@opencord/shared/types";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export interface MessagePage {
  data: Message[];
  nextCursor: string | null;
}

export function channelMessagesQueryKey(channelId: string) {
  return ["channels", channelId, "messages"] as const;
}

export function channelPinsQueryKey(channelId: string) {
  return ["channels", channelId, "pins"] as const;
}

export function channelPinsQuery(channelId: string) {
  return queryOptions({
    queryKey: channelPinsQueryKey(channelId),
    queryFn: ({ signal }) =>
      api<Message[]>(`/channels/${channelId}/pins`, { signal }),
  });
}

export function encodeCursor(id: string): string {
  return btoa(id).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function channelMessagesAroundQueryKey(
  channelId: string,
  anchorId: string,
) {
  return ["channels", channelId, "messages", "around", anchorId] as const;
}

export function channelMessageCaches(channelId: string) {
  return { queryKey: channelMessagesQueryKey(channelId) };
}

function pagePath(
  channelId: string,
  anchorId: string | null,
  pageParam: string | null,
): string {
  if (anchorId !== null) {
    return `/channels/${channelId}/messages?around=${encodeCursor(anchorId)}`;
  }

  return `/channels/${channelId}/messages${
    pageParam === null ? "" : `?before=${encodeURIComponent(pageParam)}`
  }`;
}

export function channelMessagesQuery(
  channelId: string,
  anchorId: string | null = null,
) {
  return infiniteQueryOptions({
    queryKey:
      anchorId === null
        ? channelMessagesQueryKey(channelId)
        : channelMessagesAroundQueryKey(channelId, anchorId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const page = await api<MessagePage>(
        pagePath(channelId, anchorId, pageParam),
        { signal },
      );

      return anchorId === null
        ? page
        : { ...page, data: [...page.data].reverse() };
    },
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function fetchNewerMessages(
  channelId: string,
  afterMessageId: string,
): Promise<MessagePage> {
  return api<MessagePage>(
    `/channels/${channelId}/messages?after=${encodeCursor(afterMessageId)}`,
  );
}
