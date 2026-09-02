import { infiniteQueryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export type AuditAction =
  | "member_kick"
  | "member_ban"
  | "member_unban"
  | "invite_create"
  | "invite_redeem"
  | "role_create"
  | "role_update"
  | "role_delete"
  | "role_assign"
  | "role_unassign"
  | "overwrite_update"
  | "overwrite_delete"
  | "channel_create"
  | "channel_update"
  | "channel_delete"
  | "server_update"
  | "server_transfer"
  | "message_delete"
  | "message_pin"
  | "message_unpin";

export interface AuditLogEntry {
  id: string;
  actorId: string;
  action: AuditAction;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface AuditLogPage {
  data: AuditLogEntry[];
  nextCursor: string | null;
}

export function auditLogQueryKey(serverId: string) {
  return ["servers", serverId, "audit-log"] as const;
}

export function auditLogQuery(serverId: string) {
  return infiniteQueryOptions({
    queryKey: auditLogQueryKey(serverId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api<AuditLogPage>(
        `/servers/${serverId}/audit-log${
          pageParam === null ? "" : `?cursor=${encodeURIComponent(pageParam)}`
        }`,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
}
