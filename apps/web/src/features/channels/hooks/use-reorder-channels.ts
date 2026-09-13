import type { ReorderChannelsInput } from "@opencord/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  type ChannelListEntry,
  serverChannelsQueryKey,
} from "@/features/channels/api/queries";
import { api } from "@/lib/api-client";

export interface ReorderState {
  reorder: (channelIds: string[]) => void;
  isPending: boolean;
}

function sortBy(
  channels: readonly ChannelListEntry[],
  channelIds: readonly string[],
): ChannelListEntry[] {
  const order = new Map(channelIds.map((id, index) => [id, index]));

  return [...channels].sort(
    (left, right) =>
      (order.get(left.id) ?? left.position) -
      (order.get(right.id) ?? right.position),
  );
}

export function useReorderChannels(serverId: string): ReorderState {
  const queryClient = useQueryClient();
  const queryKey = serverChannelsQueryKey(serverId);

  const mutation = useMutation({
    meta: { inline: true },
    mutationFn: (channelIds: string[]) =>
      api<unknown>(`/servers/${serverId}/channels/positions`, {
        method: "PATCH",
        body: { channelIds } satisfies ReorderChannelsInput,
      }),
    onMutate: async (channelIds) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<ChannelListEntry[]>(queryKey);

      queryClient.setQueryData<ChannelListEntry[]>(queryKey, (channels) =>
        channels === undefined ? channels : sortBy(channels, channelIds),
      );

      return { previous };
    },
    onError: (_error, _channelIds, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    reorder: (channelIds: string[]) => {
      mutation.mutate(channelIds);
    },
    isPending: mutation.isPending,
  };
}
