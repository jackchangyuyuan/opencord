import type { AuditAction } from "@opencord/shared/constants";
import { infiniteQueryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export type { AuditAction };

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
