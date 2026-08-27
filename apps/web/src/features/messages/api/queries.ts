import type { Message } from "@opencord/shared/types";
import { infiniteQueryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export interface MessagePage {
  data: Message[];
  nextCursor: string | null;
}

export function channelMessagesQueryKey(channelId: string) {
  return ["channels", channelId, "messages"] as const;
}

export function channelMessagesQuery(channelId: string) {
  return infiniteQueryOptions({
    queryKey: channelMessagesQueryKey(channelId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api<MessagePage>(
        `/channels/${channelId}/messages${
          pageParam === null ? "" : `?before=${encodeURIComponent(pageParam)}`
        }`,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function encodeCursor(id: string): string {
  return btoa(id).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function fetchNewerMessages(
  channelId: string,
  afterMessageId: string,
): Promise<MessagePage> {
  return api<MessagePage>(
    `/channels/${channelId}/messages?after=${encodeCursor(afterMessageId)}`,
  );
}
