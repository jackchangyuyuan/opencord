import { asc, eq } from "drizzle-orm";

import type { ChannelRow } from "../../access/context.js";
import { db } from "../../db/index.js";
import { channels, type ChannelType } from "../../db/schema/index.js";

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
  accessible: ReadonlySet<string>,
): Promise<ChannelSummary[]> {
  const rows = await db
    .select()
    .from(channels)
    .where(eq(channels.serverId, serverId))
    .orderBy(asc(channels.position), asc(channels.id));

  return rows
    .filter((channel) => accessible.has(channel.id))
    .map(serializeChannel);
}
