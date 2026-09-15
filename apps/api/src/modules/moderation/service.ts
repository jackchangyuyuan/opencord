import { and, eq } from "drizzle-orm";

import type { ServerContext } from "../../access/context.js";
import { db, type Transaction } from "../../db/index.js";
import { bans, serverMembers } from "../../db/schema/index.js";
import { lockMembershipPair } from "../../lib/advisory-locks.js";
import { writeAudit } from "../../lib/audit.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { emitMemberEvent } from "../../socket/emit.js";
import { disconnectUserSockets, syncUserRooms } from "../../socket/rooms.js";
import { isServerMember, lockedServerOwner } from "../members/queries.js";
import { actorPosition, requireBelowActor } from "../roles/policy.js";
import { highestPositionFor } from "../roles/queries.js";

async function requireNotOwner(
  tx: Transaction,
  serverId: string,
  targetId: string,
): Promise<void> {
  if ((await lockedServerOwner(tx, serverId)) === targetId) {
    throw forbidden("TARGET_IS_OWNER", "The owner is outside the hierarchy");
  }
}

async function requireRemovable(
  context: ServerContext,
  targetId: string,
): Promise<void> {
  if (context.server.ownerId === targetId) {
    throw forbidden("TARGET_IS_OWNER", "The owner is outside the hierarchy");
  }

  if (context.userId === targetId) {
    throw forbidden("TARGET_IS_SELF", "Leave the server instead");
  }

  requireBelowActor(
    await highestPositionFor(context.server.id, targetId),
    actorPosition(context),
  );
}

export async function kickMember(
  context: ServerContext,
  targetId: string,
): Promise<void> {
  if (!(await isServerMember(context.server.id, targetId))) {
    throw notFound("MEMBER_NOT_FOUND", "That member is not in this server");
  }

  await requireRemovable(context, targetId);

  await db.transaction(async (tx) => {
    await requireNotOwner(tx, context.server.id, targetId);

    await tx
      .delete(serverMembers)
      .where(
        and(
          eq(serverMembers.serverId, context.server.id),
          eq(serverMembers.userId, targetId),
        ),
      );

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId: context.userId,
      action: "member_kick",
      targetType: "user",
      targetId,
    });
  });

  await syncUserRooms([targetId]);

  emitMemberEvent("member:leave", context.server.id, targetId);
}

export async function banMember(
  context: ServerContext,
  targetId: string,
  reason: string | null,
): Promise<void> {
  await requireRemovable(context, targetId);

  await db.transaction(async (tx) => {
    await requireNotOwner(tx, context.server.id, targetId);

    await lockMembershipPair(tx, context.server.id, targetId);

    await tx
      .insert(bans)
      .values({
        serverId: context.server.id,
        userId: targetId,
        reason,
        bannedBy: context.userId,
      })
      .onConflictDoUpdate({
        target: [bans.serverId, bans.userId],
        set: { reason, bannedBy: context.userId },
      });

    await tx
      .delete(serverMembers)
      .where(
        and(
          eq(serverMembers.serverId, context.server.id),
          eq(serverMembers.userId, targetId),
        ),
      );

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId: context.userId,
      action: "member_ban",
      targetType: "user",
      targetId,
      ...(reason === null ? {} : { metadata: { reason } }),
    });
  });

  await syncUserRooms([targetId]);

  disconnectUserSockets(targetId);

  emitMemberEvent("member:leave", context.server.id, targetId);
}

export async function unbanMember(
  context: ServerContext,
  targetId: string,
): Promise<void> {
  const removed = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(bans)
      .where(
        and(eq(bans.serverId, context.server.id), eq(bans.userId, targetId)),
      )
      .returning({ userId: bans.userId });

    if (rows.length === 0) {
      return false;
    }

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId: context.userId,
      action: "member_unban",
      targetType: "user",
      targetId,
    });

    return true;
  });

  if (!removed) {
    throw notFound("BAN_NOT_FOUND", "That user is not banned");
  }
}
