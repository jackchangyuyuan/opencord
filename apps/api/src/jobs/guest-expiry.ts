import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { db, type Transaction } from "../db/index.js";
import {
  auditLog,
  guestQuotas,
  readStates,
  serverMembers,
  servers,
  sessions,
  users,
} from "../db/schema/index.js";
import { logger } from "../lib/logger.js";
import { emitPermissionsChanged, emitServerEvent } from "../socket/emit.js";
import { revokeUserEverywhere, syncUserRooms } from "../socket/rooms.js";

export const GUEST_EXPIRY_INTERVAL_MS = 5 * 60 * 1000;

export interface ExpiryResult {
  expired: number;
  serversDeleted: number;
  serversTransferred: number;
}

interface Disposal {
  serverId: string;
  nextOwnerId: string | null;
}

async function planDisposal(
  tx: Transaction,
  guestId: string,
  now: Date,
): Promise<Disposal[]> {
  const owned = await tx
    .select({ id: servers.id, isDemoSandbox: servers.isDemoSandbox })
    .from(servers)
    .where(eq(servers.ownerId, guestId))
    .for("no key update");

  const plans: Disposal[] = [];

  for (const server of owned) {
    const remaining = await tx
      .select({ userId: serverMembers.userId, username: users.username })
      .from(serverMembers)
      .innerJoin(users, eq(users.id, serverMembers.userId))
      .where(
        and(
          eq(serverMembers.serverId, server.id),
          ne(serverMembers.userId, guestId),
          isNull(users.deactivatedAt),
          or(
            isNull(users.isAnonymous),
            eq(users.isAnonymous, false),
            isNull(users.guestExpiresAt),
            gt(users.guestExpiresAt, sql`${now.toISOString()}::timestamp`),
          ),
        ),
      )
      .orderBy(asc(serverMembers.joinedAt), asc(serverMembers.userId))
      .for("share", { of: users });

    const heir = remaining[0]?.userId;

    plans.push({ serverId: server.id, nextOwnerId: heir ?? null });
  }

  return plans;
}

interface Transfer {
  serverId: string;
  nextOwnerId: string;
}

interface Expiry {
  expired: boolean;
  deleted: number;
  transferred: Transfer[];
}

export async function expireGuest(guestId: string, now: Date): Promise<Expiry> {
  return db.transaction(async (tx) => {
    const [subject] = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, guestId),
          eq(users.isAnonymous, true),
          isNull(users.deactivatedAt),
          lte(users.guestExpiresAt, sql`${now.toISOString()}::timestamp`),
        ),
      )
      .for("update");

    if (subject === undefined) {
      return { expired: false, deleted: 0, transferred: [] };
    }

    const plans = await planDisposal(tx, guestId, now);

    const transferred = plans.flatMap((plan): Transfer[] =>
      plan.nextOwnerId === null
        ? []
        : [{ serverId: plan.serverId, nextOwnerId: plan.nextOwnerId }],
    );
    const doomed = plans.filter((plan) => plan.nextOwnerId === null);

    for (const plan of transferred) {
      await tx
        .update(servers)
        .set({ ownerId: plan.nextOwnerId })
        .where(eq(servers.id, plan.serverId));

      await tx.insert(auditLog).values({
        serverId: plan.serverId,
        actorId: plan.nextOwnerId,
        action: "server_transfer",
        targetType: "user",
        targetId: plan.nextOwnerId,
        metadata: { reason: "guest_expiry", previousOwnerId: guestId },
      });
    }

    if (doomed.length > 0) {
      await tx.delete(servers).where(
        inArray(
          servers.id,
          doomed.map((plan) => plan.serverId),
        ),
      );
    }

    await tx.delete(sessions).where(eq(sessions.userId, guestId));

    await tx.delete(serverMembers).where(eq(serverMembers.userId, guestId));
    await tx.delete(readStates).where(eq(readStates.userId, guestId));
    await tx.delete(guestQuotas).where(eq(guestQuotas.userId, guestId));

    // Deactivation, not deletion: messages.author_id is NOT NULL with no delete
    // action, and a cascade would take a guest's messages out of other people's
    // history.
    await tx
      .update(users)
      .set({ deactivatedAt: new Date() })
      .where(eq(users.id, guestId));

    return { expired: true, deleted: doomed.length, transferred };
  });
}

export async function runGuestExpiry(now = new Date()): Promise<ExpiryResult> {
  const due = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.isAnonymous, true),
        isNull(users.deactivatedAt),
        lte(users.guestExpiresAt, sql`${now.toISOString()}::timestamp`),
      ),
    );

  const result: ExpiryResult = {
    expired: 0,
    serversDeleted: 0,
    serversTransferred: 0,
  };

  for (const { id: guestId } of due) {
    const outcome = await expireGuest(guestId, now);

    if (!outcome.expired) {
      continue;
    }

    result.expired += 1;
    result.serversDeleted += outcome.deleted;
    result.serversTransferred += outcome.transferred.length;

    for (const plan of outcome.transferred) {
      emitServerEvent("server:update", plan.serverId);
      emitPermissionsChanged(plan.serverId);
      await syncUserRooms([plan.nextOwnerId]);
    }

    revokeUserEverywhere(guestId);
  }

  if (result.expired > 0) {
    logger.info(result, "Guest expiry finished");
  }

  return result;
}
