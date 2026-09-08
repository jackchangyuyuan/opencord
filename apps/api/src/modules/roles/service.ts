import type {
  CreateRoleInput,
  ReorderRolesInput,
  UpdateRoleInput,
} from "@opencord/shared/schemas";
import { and, asc, eq, not, sql } from "drizzle-orm";

import type { RoleRow, ServerContext } from "../../access/context.js";
import { db } from "../../db/index.js";
import { roles } from "../../db/schema/index.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError, forbidden, notFound } from "../../lib/errors.js";
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

async function requireRankedBelowActor(
  context: ServerContext,
  actorId: string,
  roleId: string,
): Promise<RoleRow> {
  const role = await findServerRole(context.server.id, roleId);

  if (role === undefined) {
    throw notFound("ROLE_NOT_FOUND", "That role is not part of this server");
  }

  requireBelowActor(role.position, actorPosition(context, actorId));

  return role;
}

// Its permissions, and that is all. `@everyone` has no rank to move -- position
// 0 is reserved for it by a partial unique index -- and a default role with a
// colour would paint the whole roster.
const DEFAULT_ROLE_EDITABLE = new Set(["permissions"]);

function requireDefaultRoleFields(input: UpdateRoleInput): void {
  const offending = Object.entries(input)
    .filter(
      ([field, value]) =>
        value !== undefined && !DEFAULT_ROLE_EDITABLE.has(field),
    )
    .map(([field]) => field);

  if (offending.length > 0) {
    throw forbidden(
      "ROLE_IS_DEFAULT",
      "Only the permissions of the @everyone role can be changed",
      { fields: offending },
    );
  }
}

// The bottom of the rankable band, immediately above `@everyone`. The top would
// hand an unconfigured role authority over every configured one, and a number in
// the middle collides: `position` carries no unique index, so two roles at 1
// sort by uuid and the new one lands wherever its id happens to fall.
const BOTTOM_POSITION = 1;

export async function createRole(
  context: ServerContext,
  actorId: string,
  input: CreateRoleInput,
): Promise<PublicRole> {
  const actor = actorPosition(context, actorId);
  const atBottom = input.position === undefined;

  requireBelowActor(
    input.position ?? BOTTOM_POSITION,
    atBottom ? actor + 1 : actor,
  );
  requireHeldPermissions(context, input.permissions);

  const created = await db.transaction(async (tx) => {
    if (atBottom) {
      // `@everyone` is excluded by name rather than by position: it is pinned at 0 by
      // a partial unique index, and moving it is refused everywhere else in this file.
      await tx
        .update(roles)
        .set({ position: sql`${roles.position} + 1` })
        .where(
          and(eq(roles.serverId, context.server.id), not(roles.isDefault)),
        );
    }

    const [role] = await tx
      .insert(roles)
      .values({
        serverId: context.server.id,
        name: input.name,
        color: input.color ?? null,
        permissions: input.permissions,
        position: input.position ?? BOTTOM_POSITION,
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
  const role = await requireRankedBelowActor(context, actorId, roleId);

  if (role.isDefault) {
    requireDefaultRoleFields(input);
  }

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

function requireSlotsBelowActor(
  before: readonly { id: string; position: number }[],
  after: readonly string[],
  actor: number,
): void {
  const slotOf = new Map(before.map((role, index) => [role.id, index]));

  after.forEach((roleId, index) => {
    const from = slotOf.get(roleId);

    if (from === undefined || from === index) {
      return;
    }

    for (const slot of [from, index]) {
      requireBelowActor(before[slot]?.position ?? 0, actor);
    }
  });
}

export interface ReorderRolesResult {
  roles: PublicRole[];
}

export async function reorderRoles(
  context: ServerContext,
  actorId: string,
  input: ReorderRolesInput,
): Promise<ReorderRolesResult> {
  const serverId = context.server.id;
  const unique = new Set(input.roleIds);

  if (unique.size !== input.roleIds.length) {
    throw new AppError(
      400,
      "DUPLICATE_ROLE",
      "A role may appear in the order only once",
    );
  }

  const ordered = await db.transaction(async (tx) => {
    const current = await tx
      .select({
        id: roles.id,
        position: roles.position,
        isDefault: roles.isDefault,
      })
      .from(roles)
      .where(eq(roles.serverId, serverId))
      .orderBy(asc(roles.position), asc(roles.id))
      .for("update");

    const known = new Map(current.map((role) => [role.id, role]));

    for (const roleId of input.roleIds) {
      const role = known.get(roleId);

      if (role === undefined) {
        throw notFound(
          "ROLE_NOT_FOUND",
          "That role is not part of this server",
        );
      }

      if (role.isDefault) {
        throw forbidden(
          "ROLE_IS_DEFAULT",
          "The @everyone role has no position to change",
        );
      }
    }

    const rankable = current.filter((role) => !role.isDefault);
    const moving = new Set(input.roleIds);
    const queue = [...input.roleIds];
    const merged = rankable.map((role) =>
      moving.has(role.id) ? (queue.shift() ?? role.id) : role.id,
    );

    requireSlotsBelowActor(rankable, merged, actorPosition(context, actorId));

    if (merged.length > 0) {
      await tx.execute(sql`
        update ${roles} as r
           set position = v.position
          from (values ${sql.join(
            merged.map(
              (roleId, index) => sql`(${roleId}::uuid, ${index + 1}::int)`,
            ),
            sql`, `,
          )}) as v(id, position)
         where r.id = v.id and r.server_id = ${serverId}
      `);
    }

    await writeAudit(tx, {
      serverId,
      actorId,
      action: "role_update",
      targetType: "role",
      targetId: merged[0] ?? serverId,
      metadata: { reordered: input.roleIds },
    });

    return tx
      .select()
      .from(roles)
      .where(eq(roles.serverId, serverId))
      .orderBy(asc(roles.position), asc(roles.id));
  });

  await announceRoleChange(serverId);

  return { roles: ordered.map(serializeRole) };
}

export async function deleteRole(
  context: ServerContext,
  actorId: string,
  roleId: string,
): Promise<void> {
  const role = await requireRankedBelowActor(context, actorId, roleId);

  if (role.isDefault) {
    throw forbidden("ROLE_IS_DEFAULT", "The @everyone role cannot be deleted");
  }

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
