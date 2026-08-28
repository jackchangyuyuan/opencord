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
  serverId?: string;
  offset?: number;
}

export function searchQueryKey(input: SearchInput) {
  return [
    "search",
    input.q,
    input.serverId ?? null,
    input.offset ?? 0,
  ] as const;
}

function searchPath(input: SearchInput): string {
  const params = new URLSearchParams({
    q: input.q,
    limit: String(SEARCH_PAGE_SIZE),
  });

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
