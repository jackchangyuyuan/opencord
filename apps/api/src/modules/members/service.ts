import { and, eq } from "drizzle-orm";

import type { RoleRow, ServerContext } from "../../access/context.js";
import { db } from "../../db/index.js";
import { memberRoles } from "../../db/schema/index.js";
import { writeAudit } from "../../lib/audit.js";
import { forbidden, notFound } from "../../lib/errors.js";
import {
  actorPosition,
  findServerRole,
  highestPositionOf,
} from "../roles/queries.js";
import { requireBelowActor, requireHeldPermissions } from "../roles/service.js";
import { isServerMember, listMemberRoleIds } from "./queries.js";

async function requireAssignableRole(
  context: ServerContext,
  actorId: string,
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

  requireBelowActor(role.position, actorPosition(context, actorId));

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
  actorId: string,
  targetUserId: string,
  roleId: string,
): Promise<string[]> {
  await requireTargetMember(context, targetUserId);

  const role = await requireAssignableRole(context, actorId, roleId);

  requireHeldPermissions(context, role.permissions);

  await db.transaction(async (tx) => {
    await tx
      .insert(memberRoles)
      .values({ serverId: context.server.id, userId: targetUserId, roleId })
      .onConflictDoNothing();

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId,
      action: "role_assign",
      targetType: "member",
      targetId: targetUserId,
      metadata: { roleId },
    });
  });

  return listMemberRoleIds(context.server.id, targetUserId);
}

export async function unassignRole(
  context: ServerContext,
  actorId: string,
  targetUserId: string,
  roleId: string,
): Promise<string[]> {
  await requireTargetMember(context, targetUserId);
  await requireAssignableRole(context, actorId, roleId);

  const target = await highestPositionOf(context.server.id, targetUserId);

  requireBelowActor(target, actorPosition(context, actorId));

  await db.transaction(async (tx) => {
    await tx
      .delete(memberRoles)
      .where(
        and(
          eq(memberRoles.serverId, context.server.id),
          eq(memberRoles.userId, targetUserId),
          eq(memberRoles.roleId, roleId),
        ),
      );

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId,
      action: "role_unassign",
      targetType: "member",
      targetId: targetUserId,
      metadata: { roleId },
    });
  });

  return listMemberRoleIds(context.server.id, targetUserId);
}
