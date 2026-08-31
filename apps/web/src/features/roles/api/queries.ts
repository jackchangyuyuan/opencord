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

export const ROLE_PALETTE = [
  { name: "Slate", value: 0x64748b },
  { name: "Red", value: 0xef4444 },
  { name: "Amber", value: 0xf59e0b },
  { name: "Green", value: 0x22c55e },
  { name: "Teal", value: 0x14b8a6 },
  { name: "Blue", value: 0x3b82f6 },
  { name: "Violet", value: 0x8b5cf6 },
  { name: "Pink", value: 0xec4899 },
] as const;

export function roleColor(role: PublicRole | undefined): string | undefined {
  if (role?.color == null || role.color === 0) {
    return undefined;
  }

  return `#${role.color.toString(16).padStart(6, "0")}`;
}
