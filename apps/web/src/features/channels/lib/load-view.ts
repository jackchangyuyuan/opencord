import { type QueryClient, useQueryClient } from "@tanstack/react-query";

import {
  channelQuery,
  type ChannelSummary,
  serverChannelsQuery,
  serverChannelsQueryKey,
} from "@/features/channels/api/queries";
import type { ResolvedView } from "@/features/channels/lib/resolved-view";
import {
  dmParticipantsQuery,
  dmParticipantsQueryKey,
  dmsQuery,
  dmsQueryKey,
} from "@/features/dms/api/queries";
import { serverMembersQuery } from "@/features/members/api/queries";
import {
  channelMessagesQuery,
  channelMessagesQueryKey,
} from "@/features/messages/api/queries";
import { serverQuery, serverQueryKey } from "@/features/servers/api/queries";

const CACHED_IS_ENOUGH = { staleTime: "static" } as const;

interface Need {
  key: readonly unknown[];
  fetch: () => Promise<unknown>;
}

function held(queryClient: QueryClient, need: Need): boolean {
  return queryClient.getQueryData(need.key) !== undefined;
}

function needs(
  queryClient: QueryClient,
  view: ResolvedView,
  channel: ChannelSummary | undefined,
  from?: ResolvedView,
): Need[] {
  if (view.channelId === undefined) {
    if (view.onDirectMessages) {
      return [
        {
          key: dmsQueryKey,
          fetch: () => queryClient.query({ ...dmsQuery, ...CACHED_IS_ENOUGH }),
        },
      ];
    }

    if (view.serverId === undefined) {
      return [];
    }

    const serverId = view.serverId;

    return [
      {
        key: serverQueryKey(serverId),
        fetch: () =>
          queryClient.query({ ...serverQuery(serverId), ...CACHED_IS_ENOUGH }),
      },
      {
        key: serverChannelsQueryKey(serverId),
        fetch: () =>
          queryClient.query({
            ...serverChannelsQuery(serverId),
            ...CACHED_IS_ENOUGH,
          }),
      },
    ];
  }

  const channelId = view.channelId;

  if (channel === undefined) {
    return [];
  }

  const list: Need[] = [
    {
      key: channelMessagesQueryKey(channelId),
      fetch: () =>
        queryClient.infiniteQuery({
          ...channelMessagesQuery(channelId, null),
          ...CACHED_IS_ENOUGH,
        }),
    },
  ];

  if (channel.serverId === null) {
    list.push(
      {
        key: dmParticipantsQueryKey(channelId),
        fetch: () =>
          queryClient.query({
            ...dmParticipantsQuery(channelId),
            ...CACHED_IS_ENOUGH,
          }),
      },
      {
        key: dmsQueryKey,
        fetch: () => queryClient.query({ ...dmsQuery, ...CACHED_IS_ENOUGH }),
      },
    );

    return list;
  }

  const serverId = channel.serverId;
  const leaving =
    from?.channelId === undefined
      ? undefined
      : queryClient.getQueryData<ChannelSummary>(
          channelQuery(from.channelId).queryKey,
        );

  if (leaving?.serverId === serverId) {
    return list;
  }

  list.push(
    {
      key: serverQueryKey(serverId),
      fetch: () =>
        queryClient.query({ ...serverQuery(serverId), ...CACHED_IS_ENOUGH }),
    },
    {
      key: serverChannelsQueryKey(serverId),
      fetch: () =>
        queryClient.query({
          ...serverChannelsQuery(serverId),
          ...CACHED_IS_ENOUGH,
        }),
    },
  );

  return list;
}

function warmRoster(
  queryClient: QueryClient,
  serverId: string | null,
  sameServer: boolean,
): void {
  if (serverId === null || sameServer) {
    return;
  }

  void queryClient
    .infiniteQuery({ ...serverMembersQuery(serverId), ...CACHED_IS_ENOUGH })
    .catch(() => undefined);
}

function leavingServerId(
  queryClient: QueryClient,
  from?: ResolvedView,
): string | null | undefined {
  return from?.channelId === undefined
    ? undefined
    : queryClient.getQueryData<ChannelSummary>(
        channelQuery(from.channelId).queryKey,
      )?.serverId;
}

export function viewIsCached(
  queryClient: QueryClient,
  view: ResolvedView,
  from?: ResolvedView,
): boolean {
  const channel =
    view.channelId === undefined
      ? undefined
      : queryClient.getQueryData<ChannelSummary>(
          channelQuery(view.channelId).queryKey,
        );

  if (view.channelId !== undefined && channel === undefined) {
    return false;
  }

  return needs(queryClient, view, channel, from).every((need) =>
    held(queryClient, need),
  );
}

export async function loadView(
  queryClient: QueryClient,
  view: ResolvedView,
  from?: ResolvedView,
): Promise<void> {
  const channel =
    view.channelId === undefined
      ? undefined
      : await queryClient.query({
          ...channelQuery(view.channelId),
          ...CACHED_IS_ENOUGH,
        });

  warmRoster(
    queryClient,
    channel?.serverId ?? null,
    leavingServerId(queryClient, from) === channel?.serverId,
  );

  await Promise.all(
    needs(queryClient, view, channel, from).map((need) => need.fetch()),
  );
}

export function usePrefetchChannel(): (channelId: string) => void {
  const queryClient = useQueryClient();

  return (channelId: string) => {
    void loadView(queryClient, {
      channelId,
      serverId: undefined,
      onDirectMessages: false,
    }).catch(() => undefined);
  };
}
