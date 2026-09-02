import { and, eq, inArray, ne, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import { channelMembers, dmPairs, users } from "../../db/schema/index.js";
import { type ChannelSummary, serializeChannel } from "../channels/queries.js";
import {
  loadUnreadStates,
  NOTHING_UNREAD,
  type UnreadState,
} from "../channels/read-state/unread.js";
import { type PublicUser, serializeUser } from "../users/queries.js";

export type DmSummary = ChannelSummary &
  UnreadState & { recipient: PublicUser };

export interface CanonicalPair {
  low: SQL;
  high: SQL;
}

export function canonicalPair(a: string, b: string): CanonicalPair {
  return {
    low: sql`least(${a}::text collate "C", ${b}::text collate "C")`,
    high: sql`greatest(${a}::text collate "C", ${b}::text collate "C")`,
  };
}

export async function loadDmChannel(channelId: string) {
  const channel = await db.query.channels.findFirst({
    where: { id: channelId },
  });

  if (channel === undefined) {
    throw new Error("a direct-message channel vanished between statements");
  }

  return channel;
}

export async function findDmChannelId(
  a: string,
  b: string,
): Promise<string | undefined> {
  const pair = canonicalPair(a, b);

  const [row] = await db
    .select({ channelId: dmPairs.channelId })
    .from(dmPairs)
    .where(and(eq(dmPairs.userA, pair.low), eq(dmPairs.userB, pair.high)));

  return row?.channelId;
}

export async function listDms(userId: string): Promise<DmSummary[]> {
  const membership = await db
    .select({ channelId: channelMembers.channelId })
    .from(channelMembers)
    .where(eq(channelMembers.userId, userId));

  const channelIds = membership.map((row) => row.channelId);

  if (channelIds.length === 0) {
    return [];
  }

  const rows = await db.query.channels.findMany({
    where: { id: { in: channelIds } },
  });

  const counterparts = await db
    .select({
      channelId: channelMembers.channelId,
      id: users.id,
      username: users.username,
      name: users.name,
      image: users.image,
    })
    .from(channelMembers)
    .innerJoin(users, eq(users.id, channelMembers.userId))
    .where(
      and(
        inArray(channelMembers.channelId, channelIds),
        ne(channelMembers.userId, userId),
      ),
    );

  const unread = await loadUnreadStates(userId, channelIds);
  const byChannel = new Map(counterparts.map((row) => [row.channelId, row]));

  return rows
    .flatMap((channel) => {
      const other = byChannel.get(channel.id);

      return other === undefined
        ? []
        : [
            {
              ...serializeChannel(channel),
              ...(unread.get(channel.id) ?? NOTHING_UNREAD),
              recipient: serializeUser(other),
            },
          ];
    })
    .sort((left, right) => {
      const a = left.lastMessageId ?? "";
      const b = right.lastMessageId ?? "";

      return a < b ? 1 : a > b ? -1 : 0;
    });
}

export async function listDmParticipants(
  channelId: string,
): Promise<PublicUser[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      image: users.image,
    })
    .from(channelMembers)
    .innerJoin(users, eq(users.id, channelMembers.userId))
    .where(eq(channelMembers.channelId, channelId))
    .orderBy(users.username);

  return rows.map((row) => serializeUser(row));
}
