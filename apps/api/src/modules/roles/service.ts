import type {
  CreateRoleInput,
  UpdateRoleInput,
} from "@opencord/shared/schemas";
import { eq } from "drizzle-orm";

import type { RoleRow, ServerContext } from "../../access/context.js";
import { db } from "../../db/index.js";
import { roles } from "../../db/schema/index.js";
import { writeAudit } from "../../lib/audit.js";
import { forbidden, notFound } from "../../lib/errors.js";
import {
  emitPermissionsChanged,
  emitRoleUpdate,
  rederiveRoomsFor,
  serverMemberIds,
} from "../../socket/emit.js";
import {
  actorPosition,
  findServerRole,
  type PublicRole,
  serializeRole,
} from "./queries.js";

export async function announceRoleChange(serverId: string): Promise<void> {
  await rederiveRoomsFor(await serverMemberIds(serverId));

  emitRoleUpdate(serverId);
  emitPermissionsChanged(serverId);
}

export function requireBelowActor(position: number, actor: number): void {
  if (position >= actor) {
    throw forbidden(
      "ROLE_HIERARCHY",
      "That role is at or above your highest role",
    );
  }
}

export function requireHeldPermissions(
  context: ServerContext,
  mask: number,
): void {
  if ((mask & ~context.permissions) !== 0) {
    throw forbidden(
      "PERMISSION_NOT_HELD",
      "You cannot grant a permission you do not hold",
    );
  }
}

async function requireEditableRole(
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
      "The @everyone role cannot be edited this way",
    );
  }

  requireBelowActor(role.position, actorPosition(context, actorId));

  return role;
}

export async function createRole(
  context: ServerContext,
  actorId: string,
  input: CreateRoleInput,
): Promise<PublicRole> {
  requireBelowActor(input.position, actorPosition(context, actorId));
  requireHeldPermissions(context, input.permissions);

  const created = await db.transaction(async (tx) => {
    const [role] = await tx
      .insert(roles)
      .values({
        serverId: context.server.id,
        name: input.name,
        color: input.color ?? null,
        permissions: input.permissions,
        position: input.position,
      })
      .returning();

    if (role === undefined) {
      throw new Error("Role creation returned no row");
    }

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId,
      action: "role_create",
      targetType: "role",
      targetId: role.id,
      metadata: { name: role.name, permissions: role.permissions },
    });

    return serializeRole(role);
  });

  await announceRoleChange(context.server.id);

  return created;
}

export async function updateRole(
  context: ServerContext,
  actorId: string,
  roleId: string,
  input: UpdateRoleInput,
): Promise<PublicRole> {
  await requireEditableRole(context, actorId, roleId);

  if (input.permissions !== undefined) {
    requireHeldPermissions(context, input.permissions);
  }

  if (input.position !== undefined) {
    requireBelowActor(input.position, actorPosition(context, actorId));
  }

  const updated = await db.transaction(async (tx) => {
    const [role] = await tx
      .update(roles)
      .set(input)
      .where(eq(roles.id, roleId))
      .returning();

    if (role === undefined) {
      throw new Error("Role update returned no row");
    }

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId,
      action: "role_update",
      targetType: "role",
      targetId: role.id,
      metadata: input,
    });

    return serializeRole(role);
  });

  await announceRoleChange(context.server.id);

  return updated;
}

export async function deleteRole(
  context: ServerContext,
  actorId: string,
  roleId: string,
): Promise<void> {
  const role = await requireEditableRole(context, actorId, roleId);

  await db.transaction(async (tx) => {
    await tx.delete(roles).where(eq(roles.id, role.id));

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId,
      action: "role_delete",
      targetType: "role",
      targetId: role.id,
      metadata: { name: role.name },
    });
  });

  await announceRoleChange(context.server.id);
}
