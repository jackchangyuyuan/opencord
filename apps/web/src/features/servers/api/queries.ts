import { queryOptions } from "@tanstack/react-query";

import type { PublicRole } from "@/features/roles/api/queries";
import { api } from "@/lib/api-client";

export interface ServerSummary {
  id: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  iconUrl: string | null;
  ownerId: string;
  createdAt: string;
}

export const serversQueryKey = ["servers"] as const;

export const serversQuery = queryOptions({
  queryKey: serversQueryKey,
  queryFn: ({ signal }) => api<ServerSummary[]>("/servers", { signal }),
});

export interface ServerDetail extends ServerSummary {
  everyoneRole: PublicRole;
  roles: PublicRole[];
}

export function serverQueryKey(serverId: string) {
  return ["servers", serverId] as const;
}

export function serverQuery(serverId: string) {
  return queryOptions({
    queryKey: serverQueryKey(serverId),
    queryFn: ({ signal }) =>
      api<ServerDetail>(`/servers/${serverId}`, { signal }),
  });
}
