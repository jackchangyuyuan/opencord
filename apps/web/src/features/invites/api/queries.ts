import { queryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export interface InviteSummary {
  code: string;
  serverId: string;
  inviterId: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface InvitePreview {
  code: string;
  server: { id: string; name: string; iconKey: string | null };
  memberCount: number;
}

export function serverInvitesQueryKey(serverId: string) {
  return ["servers", serverId, "invites"] as const;
}

export function serverInvitesQuery(serverId: string) {
  return queryOptions({
    queryKey: serverInvitesQueryKey(serverId),
    queryFn: ({ signal }) =>
      api<InviteSummary[]>(`/servers/${serverId}/invites`, { signal }),
  });
}

export function invitePreviewQuery(code: string) {
  return queryOptions({
    queryKey: ["invites", code] as const,
    queryFn: ({ signal }) => api<InvitePreview>(`/invites/${code}`, { signal }),
    retry: false,
  });
}

export function inviteUrl(code: string): string {
  return `${window.location.origin}/invite/${code}`;
}
