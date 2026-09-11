import type { AuditAction, AuditTargetGroup } from "@opencord/shared/constants";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export type { AuditAction, AuditTargetGroup };

export interface AuditLogEntry {
  id: string;
  actorId: string;
  action: AuditAction;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface AuditLogEntryPage {
  data: AuditLogEntry[];
  nextCursor: string | null;
}

export interface AuditLogFilters {
  action: AuditAction[];
  actorId: string | null;
  target: AuditTargetGroup | null;
  from: string | null;
  to: string | null;
  q: string;
}

export const NO_AUDIT_FILTERS: AuditLogFilters = {
  action: [],
  actorId: null,
  target: null,
  from: null,
  to: null,
  q: "",
};

export function auditFiltersActive(filters: AuditLogFilters): boolean {
  return (
    filters.action.length > 0 ||
    filters.actorId !== null ||
    filters.target !== null ||
    filters.from !== null ||
    filters.to !== null ||
    filters.q.trim() !== ""
  );
}

function auditSearchParams(filters: AuditLogFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.action.length > 0) {
    params.set("action", filters.action.join(","));
  }

  if (filters.actorId !== null) {
    params.set("actorId", filters.actorId);
  }

  if (filters.target !== null) {
    params.set("target", filters.target);
  }

  if (filters.from !== null) {
    params.set("from", filters.from);
  }

  if (filters.to !== null) {
    params.set("to", filters.to);
  }

  if (filters.q.trim() !== "") {
    params.set("q", filters.q.trim());
  }

  return params;
}

export function auditLogQueryKey(
  serverId: string,
  filters: AuditLogFilters = NO_AUDIT_FILTERS,
) {
  return [
    "servers",
    serverId,
    "audit-log",
    auditSearchParams(filters).toString(),
  ] as const;
}

export function auditLogQuery(
  serverId: string,
  filters: AuditLogFilters = NO_AUDIT_FILTERS,
) {
  return infiniteQueryOptions({
    queryKey: auditLogQueryKey(serverId, filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = auditSearchParams(filters);

      if (pageParam !== null) {
        params.set("cursor", pageParam);
      }

      const query = params.toString();

      return api<AuditLogEntryPage>(
        `/servers/${serverId}/audit-log${query === "" ? "" : `?${query}`}`,
        { signal },
      );
    },
    getNextPageParam: (page) => page.nextCursor,
  });
}

export interface AuditPerson {
  id: string;
  name: string;
  username: string;
  isActor: boolean;
}

export function auditPeopleQueryKey(serverId: string) {
  return ["servers", serverId, "audit-log", "people"] as const;
}

export function auditPeopleQuery(serverId: string) {
  return queryOptions({
    queryKey: auditPeopleQueryKey(serverId),
    queryFn: ({ signal }) =>
      api<AuditPerson[]>(`/servers/${serverId}/audit-log/people`, { signal }),
    staleTime: 60_000,
  });
}
