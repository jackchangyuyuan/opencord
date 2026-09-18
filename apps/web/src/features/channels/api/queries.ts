import { queryOptions } from "@tanstack/react-query";

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
  unreadCount: number;
}

export function isChannelList(queryKey: readonly unknown[]): boolean {
  if (queryKey.length === 1) {
    return queryKey[0] === "dms";
  }

  return (
    queryKey.length === 3 &&
    queryKey[0] === "servers" &&
    queryKey[2] === "channels"
  );
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
