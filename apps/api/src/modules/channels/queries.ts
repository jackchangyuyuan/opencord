import { asc, eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import {
  type ChannelRow,
  channels,
  type ChannelType,
} from "../../db/schema/index.js";
import {
  loadUnreadStates,
  NOTHING_UNREAD,
  type UnreadState,
} from "./read-state/unread.js";

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

export type ChannelListEntry = ChannelSummary & UnreadState;

export function serializeChannel(channel: ChannelRow): ChannelSummary {
  return {
    id: channel.id,
    serverId: channel.serverId,
    type: channel.type,
    name: channel.name,
    topic: channel.topic,
    position: channel.position,
    lastMessageId: channel.lastMessageId,
    lastEveryoneMentionId: channel.lastEveryoneMentionId,
    createdAt: channel.createdAt.toISOString(),
  };
}

export async function listServerChannels(
  serverId: string,
  userId: string,
  accessible: ReadonlySet<string>,
): Promise<ChannelListEntry[]> {
  const rows = await db
    .select()
    .from(channels)
    .where(eq(channels.serverId, serverId))
    .orderBy(asc(channels.position), asc(channels.id));

  const visible = rows.filter((channel) => accessible.has(channel.id));

  const unread = await loadUnreadStates(
    userId,
    visible.map((channel) => channel.id),
  );

  return visible.map((channel) => ({
    ...serializeChannel(channel),
    ...(unread.get(channel.id) ?? NOTHING_UNREAD),
  }));
}
