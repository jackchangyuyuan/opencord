import { and, desc, eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { bans, serverMembers, users } from "../../db/schema/index.js";
import { type PublicUser, serializeUser } from "../users/queries.js";

export interface BanEntry {
  user: PublicUser;
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
      image: users.image,
      avatarObjectKey: users.avatarObjectKey,
      reason: bans.reason,
      bannedBy: bans.bannedBy,
      createdAt: bans.createdAt,
    })
    .from(bans)
    .innerJoin(users, eq(users.id, bans.userId))
    .where(eq(bans.serverId, serverId))
    .orderBy(desc(bans.createdAt), users.id);

  return Promise.all(
    rows.map(async (row) => ({
      user: await serializeUser(row),
      reason: row.reason,
      bannedBy: row.bannedBy,
      createdAt: row.createdAt.toISOString(),
    })),
  );
}
