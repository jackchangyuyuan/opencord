import type { Message } from "@opencord/shared/types";
import {
  type InfiniteData,
  infiniteQueryOptions,
  queryOptions,
  replaceEqualDeep,
} from "@tanstack/react-query";

import { rowKey } from "@/features/messages/lib/rows";
import { api } from "@/lib/api-client";

export interface MessagePage {
  data: Message[];
  nextCursor: string | null;
}

export type MessageCache = InfiniteData<MessagePage, string | null>;

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

export const MESSAGE_PAGE_SIZE = 75;

function pagePath(
  channelId: string,
  anchorId: string | null,
  pageParam: string | null,
): string {
  const params = new URLSearchParams({ limit: String(MESSAGE_PAGE_SIZE) });

  if (anchorId !== null) {
    params.set("around", encodeCursor(anchorId));
  } else if (pageParam !== null) {
    params.set("before", pageParam);
  }

  return `/channels/${channelId}/messages?${params.toString()}`;
}

function shareByIdentity(previous: unknown, incoming: unknown): unknown {
  const before = previous as MessageCache | undefined;
  const next = incoming as MessageCache;

  if (before === undefined) {
    return next;
  }

  const known = new Map<string, Message>();

  for (const page of before.pages) {
    for (const message of page.data) {
      known.set(rowKey(message), message);
    }
  }

  let settled = before.pages.length === next.pages.length;

  const pages = next.pages.map((page, index) => {
    const heldPage = before.pages[index];

    const data = page.data.map((message) => {
      const held = known.get(rowKey(message));

      return held === undefined ? message : replaceEqualDeep(held, message);
    });

    if (
      heldPage?.nextCursor === page.nextCursor &&
      heldPage.data.length === data.length &&
      data.every((message, at) => message === heldPage.data[at])
    ) {
      return heldPage;
    }

    settled = false;
    return { ...page, data };
  });

  return settled ? before : { ...next, pages };
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
    structuralSharing: shareByIdentity,
  });
}

export function fetchNewerMessages(
  channelId: string,
  afterMessageId: string,
): Promise<MessagePage> {
  return api<MessagePage>(
    `/channels/${channelId}/messages?after=${encodeCursor(afterMessageId)}&limit=${String(MESSAGE_PAGE_SIZE)}`,
  );
}
