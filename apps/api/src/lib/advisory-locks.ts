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

export async function lockGuestDisposal(tx: Transaction): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('guest-disposal', 0))`,
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

// The demo dataset is provisioned once for the whole deployment, and both a
// rollout and a restart can call for it. Two writers would each produce a full
// cast, and the second would fail on the unique index that allows one template
// server -- after it had already written everything else.
export async function lockDemoProvisioning(tx: Transaction): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('demo-provisioning', 0))`,
  );
}
