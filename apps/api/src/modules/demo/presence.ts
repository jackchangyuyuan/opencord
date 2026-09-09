import type { PresenceStatus } from "@opencord/shared/types";
import { asc, like } from "drizzle-orm";

import { db } from "../../db/index.js";
import { users } from "../../db/schema/index.js";
import { SEED_USERNAME_PREFIX } from "../../db/seed/personas.js";
import { recordConnection } from "../../socket/presence.js";

const CONNECTION_ID = "demo-ambient";

const CAST: { status: PresenceStatus; idle: boolean }[] = [
  { status: "online", idle: false },
  { status: "online", idle: false },
  { status: "idle", idle: true },
  { status: "online", idle: false },
  { status: "dnd", idle: false },
  { status: "online", idle: false },
  { status: "idle", idle: true },
  { status: "online", idle: false },
  { status: "dnd", idle: false },
  { status: "online", idle: false },
  { status: "idle", idle: true },
  { status: "online", idle: false },
  { status: "online", idle: false },
  { status: "idle", idle: true },
  { status: "dnd", idle: false },
  { status: "online", idle: false },
  { status: "online", idle: false },
  { status: "idle", idle: true },
  { status: "online", idle: false },
  { status: "dnd", idle: false },
  { status: "idle", idle: true },
  { status: "online", idle: false },
];

const STRIDE = 2;

export function demoPresenceStatusAt(offset: number): PresenceStatus {
  if (offset % STRIDE !== 0) {
    return "offline";
  }

  return CAST[offset / STRIDE]?.status ?? "offline";
}

async function castMembers(): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.username, `${SEED_USERNAME_PREFIX}%`))
    .orderBy(asc(users.id))
    .limit(CAST.length * STRIDE);

  return CAST.map((_entry, index) => rows[index * STRIDE]?.id).filter(
    (id): id is string => id !== undefined,
  );
}

export async function refreshDemoPresence(): Promise<number> {
  const members = await castMembers();

  for (const [index, userId] of members.entries()) {
    const entry = CAST[index];

    if (entry === undefined) {
      continue;
    }

    await recordConnection(userId, CONNECTION_ID, entry);
  }

  return members.length;
}
