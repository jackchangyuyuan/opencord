import { queryOptions, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";

import { serversQuery } from "@/features/servers/api/queries";
import { api } from "@/lib/api-client";

export type ChannelType = "text" | "voice" | "dm" | "group_dm";

export interface ChannelSummary {
  id: string;
  serverId: string | null;
  type: ChannelType;
  name: string | null;
  topic: string | null;
  position: number;
  lastMessageId: string | null;
  lastEveryoneMentionId: string | null;
  createdAt: string;
}

export interface ChannelListEntry extends ChannelSummary {
  lastReadMessageId: string | null;
  hasUnread: boolean;
  hasEveryone: boolean;
  mentionCount: number;
}

export function serverChannelsQueryKey(serverId: string) {
  return ["servers", serverId, "channels"] as const;
}

export function serverChannelsQuery(serverId: string) {
  return queryOptions({
    queryKey: serverChannelsQueryKey(serverId),
    queryFn: ({ signal }) =>
      api<ChannelListEntry[]>(`/servers/${serverId}/channels`, { signal }),
  });
}

export function channelQuery(channelId: string) {
  return queryOptions({
    queryKey: ["channels", channelId] as const,
    queryFn: ({ signal }) =>
      api<ChannelSummary>(`/channels/${channelId}`, { signal }),
  });
}

export function useActiveChannelId(): string | undefined {
  return useParams<{ channelId: string }>().channelId;
}

export function useActiveServerId(): string | undefined {
  const channelId = useActiveChannelId();

  const { data: channel } = useQuery({
    ...channelQuery(channelId ?? ""),
    enabled: channelId !== undefined,
  });

  const { data: servers } = useQuery(serversQuery);

  if (channelId === undefined) {
    return servers?.[0]?.id;
  }

  return channel?.serverId ?? undefined;
}

export interface RoleOverwriteEntry {
  roleId: string;
  allow: number;
  deny: number;
}

export interface MemberOverwriteEntry {
  userId: string;
  allow: number;
  deny: number;
}

export interface ChannelOverwrites {
  roles: RoleOverwriteEntry[];
  members: MemberOverwriteEntry[];
}

export function channelOverwritesQuery(channelId: string) {
  return queryOptions({
    queryKey: ["channels", channelId, "overwrites"] as const,
    queryFn: ({ signal }) =>
      api<ChannelOverwrites>(`/channels/${channelId}/overwrites`, { signal }),
  });
}
