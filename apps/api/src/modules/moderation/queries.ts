import { desc, eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { bans, users } from "../../db/schema/index.js";
import {
  profileSelection,
  type PublicUser,
  serializeUser,
} from "../users/queries.js";

export interface BanEntry {
  user: PublicUser;
  reason: string | null;
  bannedBy: string;
  createdAt: string;
}

export async function listBans(serverId: string): Promise<BanEntry[]> {
  const rows = await db
    .select({
      ...profileSelection,
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
