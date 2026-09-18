import { useQuery } from "@tanstack/react-query";
import { use } from "react";
import { useMatch, useParams } from "react-router";

import { channelQuery } from "@/features/channels/api/queries";
import { ResolvedViewContext } from "@/features/channels/lib/resolved-view";
import { serversQuery } from "@/features/servers/api/queries";

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
