import type { QueryClient } from "@tanstack/react-query";

import {
  type ChannelListEntry,
  isChannelList,
} from "@/features/channels/api/queries";
import { api } from "@/lib/api-client";

const COALESCE_MS = 150;

const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

async function read(client: QueryClient, channelId: string): Promise<void> {
  const entry = await api<ChannelListEntry>(`/channels/${channelId}/read`);

  client.setQueriesData<ChannelListEntry[]>(
    { predicate: (query) => isChannelList(query.queryKey) },
    (channels) =>
      channels?.map((channel) =>
        channel.id === channelId ? { ...channel, ...entry } : channel,
      ),
  );
}

export function refreshUnread(client: QueryClient, channelId: string): void {
  const held = scheduled.get(channelId);

  if (held !== undefined) {
    clearTimeout(held);
  }

  scheduled.set(
    channelId,
    setTimeout(() => {
      scheduled.delete(channelId);

      void read(client, channelId).catch(() => undefined);
    }, COALESCE_MS),
  );
}

export function cancelUnreadRefresh(): void {
  for (const timer of scheduled.values()) {
    clearTimeout(timer);
  }

  scheduled.clear();
}
