import { queryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export interface PublicRole {
  id: string;
  name: string;
  color: number | null;
  position: number;
  permissions: number;
  isDefault: boolean;
}

export function serverRolesQueryKey(serverId: string) {
  return ["servers", serverId, "roles"] as const;
}

export function serverRolesQuery(serverId: string) {
  return queryOptions({
    queryKey: serverRolesQueryKey(serverId),
    queryFn: ({ signal }) =>
      api<PublicRole[]>(`/servers/${serverId}/roles`, { signal }),
  });
}

export function roleColor(role: PublicRole | undefined): string | undefined {
  if (role?.color == null || role.color === 0) {
    return undefined;
  }

  return `#${role.color.toString(16).padStart(6, "0")}`;
}
