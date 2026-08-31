import { and, desc, eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { bans, serverMembers, users } from "../../db/schema/index.js";

export interface BanEntry {
  user: {
    id: string;
    username: string;
    name: string;
    avatarUrl: string | null;
  };
  reason: string | null;
  bannedBy: string;
  createdAt: string;
}

export async function isMember(
  serverId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ userId: serverMembers.userId })
    .from(serverMembers)
    .where(
      and(
        eq(serverMembers.serverId, serverId),
        eq(serverMembers.userId, userId),
      ),
    );

  return rows.length > 0;
}

export async function listBans(serverId: string): Promise<BanEntry[]> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      avatarUrl: users.image,
      reason: bans.reason,
      bannedBy: bans.bannedBy,
      createdAt: bans.createdAt,
    })
    .from(bans)
    .innerJoin(users, eq(users.id, bans.userId))
    .where(eq(bans.serverId, serverId))
    .orderBy(desc(bans.createdAt), users.id);

  return rows.map((row) => ({
    user: {
      id: row.id,
      username: row.username,
      name: row.name,
      avatarUrl: row.avatarUrl,
    },
    reason: row.reason,
    bannedBy: row.bannedBy,
    createdAt: row.createdAt.toISOString(),
  }));
}
