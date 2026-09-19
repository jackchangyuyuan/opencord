import type { QueryClient } from "@tanstack/react-query";

import type {
  ChannelListEntry,
  ChannelSummary,
} from "@/features/channels/api/queries";
import {
  channelQuery,
  serverChannelsQueryKey,
} from "@/features/channels/api/queries";

export const FIXTURE_SERVER_ID = "55555555-5555-4555-8555-555555555555";

export function seedConversation(
  client: QueryClient,
  channelId: string,
  unread: Partial<ChannelListEntry> = {},
): void {
  const summary: ChannelSummary = {
    id: channelId,
    serverId: FIXTURE_SERVER_ID,
    type: "text",
    name: "general",
    topic: null,
    position: 0,
    lastMessageId: null,
    lastEveryoneMentionId: null,
    createdAt: "2026-09-01T09:00:00.000Z",
  };

  client.setQueryData(channelQuery(channelId).queryKey, summary);

  client.setQueryData<ChannelListEntry[]>(
    serverChannelsQueryKey(FIXTURE_SERVER_ID),
    [
      {
        ...summary,
        lastReadMessageId: null,
        hasUnread: false,
        hasEveryone: false,
        mentionCount: 0,
        unreadCount: 0,
        ...unread,
      },
    ],
  );
}
