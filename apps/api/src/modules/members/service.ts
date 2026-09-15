import { and, eq } from "drizzle-orm";

import type { ServerContext } from "../../access/context.js";
import { db } from "../../db/index.js";
import { memberRoles, type RoleRow } from "../../db/schema/index.js";
import { writeAudit } from "../../lib/audit.js";
import { forbidden, notFound } from "../../lib/errors.js";
import { emitPermissionsChanged, emitRoleUpdate } from "../../socket/emit.js";
import { syncUserRooms } from "../../socket/rooms.js";
import {
  actorPosition,
  requireBelowActor,
  requireHeldPermissions,
} from "../roles/policy.js";
import { findServerRole, highestPositionFor } from "../roles/queries.js";
import { isServerMember, listMemberRoleIds } from "./queries.js";

async function requireAssignableRole(
  context: ServerContext,
  roleId: string,
): Promise<RoleRow> {
  const role = await findServerRole(context.server.id, roleId);

  if (role === undefined) {
    throw notFound("ROLE_NOT_FOUND", "That role is not part of this server");
  }

  if (role.isDefault) {
    throw forbidden(
      "ROLE_IS_DEFAULT",
      "Membership in @everyone is implied and is never assigned",
    );
  }

  requireBelowActor(role.position, actorPosition(context));

  return role;
}

async function requireTargetMember(
  context: ServerContext,
  targetUserId: string,
): Promise<void> {
  if (context.server.ownerId === targetUserId) {
    throw forbidden("TARGET_IS_OWNER", "The owner is outside the hierarchy");
  }

  if (!(await isServerMember(context.server.id, targetUserId))) {
    throw notFound(
      "MEMBER_NOT_FOUND",
      "That user is not a member of this server",
    );
  }
}

export async function assignRole(
  context: ServerContext,
  targetUserId: string,
  roleId: string,
): Promise<string[]> {
  await requireTargetMember(context, targetUserId);

  const role = await requireAssignableRole(context, roleId);

  requireHeldPermissions(context, role.permissions);

  const assigned = await db.transaction(async (tx) => {
    const written = await tx
      .insert(memberRoles)
      .values({ serverId: context.server.id, userId: targetUserId, roleId })
      .onConflictDoNothing()
      .returning({ roleId: memberRoles.roleId });

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId: context.userId,
      action: "role_assign",
      targetType: "member",
      targetId: targetUserId,
      metadata: { roleId },
    });

    return written.length > 0;
  });

  if (assigned) {
    await syncUserRooms([targetUserId]);

    emitRoleUpdate(context.server.id);
    emitPermissionsChanged(context.server.id);
  }

  return listMemberRoleIds(context.server.id, targetUserId);
}

export async function unassignRole(
  context: ServerContext,
  targetUserId: string,
  roleId: string,
): Promise<string[]> {
  await requireTargetMember(context, targetUserId);
  await requireAssignableRole(context, roleId);

  const target = await highestPositionFor(context.server.id, targetUserId);

  requireBelowActor(target, actorPosition(context));

  const unassigned = await db.transaction(async (tx) => {
    const removed = await tx
      .delete(memberRoles)
      .where(
        and(
          eq(memberRoles.serverId, context.server.id),
          eq(memberRoles.userId, targetUserId),
          eq(memberRoles.roleId, roleId),
        ),
      )
      .returning({ roleId: memberRoles.roleId });

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId: context.userId,
      action: "role_unassign",
      targetType: "member",
      targetId: targetUserId,
      metadata: { roleId },
    });

    return removed.length > 0;
  });

  if (unassigned) {
    await syncUserRooms([targetUserId]);

    emitRoleUpdate(context.server.id);
    emitPermissionsChanged(context.server.id);
  }

  return listMemberRoleIds(context.server.id, targetUserId);
}
