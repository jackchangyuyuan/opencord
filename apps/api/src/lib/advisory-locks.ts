import { sql } from "drizzle-orm";

import type { Transaction } from "../db/index.js";

// hashtextextended() returns bigint, so the tempting two-key form matches
// NEITHER signature -- PostgreSQL does not narrow bigint to integer during
// function resolution, and the statement fails at run time. The single-key form
// is the one that works, and it lives here once so the callers cannot drift.
export async function lockMembershipPair(
  tx: Transaction,
  serverId: string,
  userId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${serverId} || ':' || ${userId}, 0))`,
  );
}

export async function lockChannelPins(
  tx: Transaction,
  channelId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('pins:' || ${channelId}, 0))`,
  );
}

export async function lockChannelOverwrites(
  tx: Transaction,
  channelId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('overwrites:' || ${channelId}, 0))`,
  );
}

export async function tryLockAmbientActivity(
  tx: Transaction,
): Promise<boolean> {
  const rows = await tx.execute<{ locked: boolean }>(
    sql`select pg_try_advisory_xact_lock(hashtextextended('ambient-activity', 0)) as locked`,
  );

  return rows[0]?.locked === true;
}
