import { queryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export interface ServerSummary {
  id: string;
  name: string;
  iconKey: string | null;
  ownerId: string;
  createdAt: string;
}

export const serversQueryKey = ["servers"] as const;

export const serversQuery = queryOptions({
  queryKey: serversQueryKey,
  queryFn: ({ signal }) => api<ServerSummary[]>("/servers", { signal }),
});
