import type { Message } from "@opencord/shared/types";
import { queryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export const SEARCH_PAGE_SIZE = 25;

export interface SearchResponse {
  data: Message[];
  degraded: boolean;
  limit: number;
  offset: number;
}

export interface SearchInput {
  q: string;
  channelIds?: readonly string[];
  serverId?: string;
  offset?: number;
}

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function searchQueryKey(input: SearchInput) {
  return [
    "search",
    input.q,
    [...(input.channelIds ?? [])].sort().join(","),
    input.serverId ?? null,
    input.offset ?? 0,
    timeZone(),
  ] as const;
}

function searchPath(input: SearchInput): string {
  const params = new URLSearchParams({
    q: input.q,
    limit: String(SEARCH_PAGE_SIZE),
    tz: timeZone(),
  });

  for (const channelId of input.channelIds ?? []) {
    params.append("channel_id", channelId);
  }

  if (input.serverId !== undefined) {
    params.set("server_id", input.serverId);
  }

  if (input.offset !== undefined && input.offset > 0) {
    params.set("offset", String(input.offset));
  }

  return `/search?${params.toString()}`;
}

export function searchMessagesQuery(input: SearchInput) {
  return queryOptions({
    queryKey: searchQueryKey(input),
    queryFn: ({ signal }) => api<SearchResponse>(searchPath(input), { signal }),
    staleTime: 30_000,
  });
}
