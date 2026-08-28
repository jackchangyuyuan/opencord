import { queryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export interface InstanceStats {
  instanceId: string;
  sockets: number;
  onlineUsers: number;
  uptimeSeconds: number;
}

export const statsQueryKey = ["stats"] as const;

export const statsQuery = queryOptions({
  queryKey: statsQueryKey,
  queryFn: ({ signal }) => api<InstanceStats>("/stats", { signal }),
  refetchInterval: 15_000,
  staleTime: 10_000,
});
