import { queryOptions, useQuery } from "@tanstack/react-query";
import { use } from "react";
import { useMatch, useParams } from "react-router";

import { ResolvedViewContext } from "@/features/channels/lib/resolved-view";
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

export function useActiveChannelId(): string | undefined {
  const resolved = use(ResolvedViewContext);
  const fromRoute = useParams<{ channelId: string }>().channelId;

  return resolved === null ? fromRoute : resolved.channelId;
}

export function useRequestedChannelId(): string | undefined {
  return useParams<{ channelId: string }>().channelId;
}

export function useOnDirectMessages(): boolean {
  const resolved = use(ResolvedViewContext);
  const channelId = useActiveChannelId();
  const routeSaysDms = useMatch("/app/dms") !== null;
  const onDmsRoute =
    resolved === null ? routeSaysDms : resolved.onDirectMessages;

  const { data: channel } = useQuery({
    ...channelQuery(channelId ?? ""),
    enabled: channelId !== undefined,
  });

  return onDmsRoute || channel?.serverId === null;
}

export function useActiveServerId(): string | undefined {
  const resolved = use(ResolvedViewContext);
  const fromRoute = useParams<{ serverId: string }>().serverId;
  const namedServer = resolved === null ? fromRoute : resolved.serverId;
  const channelId = useActiveChannelId();
  const onDms = useOnDirectMessages();

  const { data: channel } = useQuery({
    ...channelQuery(channelId ?? ""),
    enabled: channelId !== undefined,
  });

  const { data: servers } = useQuery(serversQuery);

  if (onDms) {
    return undefined;
  }

  if (namedServer !== undefined) {
    return namedServer;
  }

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
