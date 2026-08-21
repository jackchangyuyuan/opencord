import { and, asc, eq } from "drizzle-orm";

import type { RoleRow, ServerContext } from "../../access/context.js";
import { db } from "../../db/index.js";
import { memberRoles, roles } from "../../db/schema/index.js";

export interface PublicRole {
  id: string;
  name: string;
  color: number | null;
  position: number;
  permissions: number;
  isDefault: boolean;
}

export function serializeRole(role: PublicRole): PublicRole {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    position: role.position,
    permissions: role.permissions,
    isDefault: role.isDefault,
  };
}

export function actorPosition(context: ServerContext, userId: string): number {
  if (context.server.ownerId === userId) {
    return Number.POSITIVE_INFINITY;
  }

  return context.memberRoles.reduce(
    (highest, role) => Math.max(highest, role.position),
    0,
  );
}

export async function highestPositionOf(
  serverId: string,
  userId: string,
): Promise<number> {
  const rows = await db
    .select({ position: roles.position })
    .from(memberRoles)
    .innerJoin(roles, eq(roles.id, memberRoles.roleId))
    .where(
      and(eq(memberRoles.serverId, serverId), eq(memberRoles.userId, userId)),
    );

  return rows.reduce((highest, row) => Math.max(highest, row.position), 0);
}

export async function findServerRole(
  serverId: string,
  roleId: string,
): Promise<RoleRow | undefined> {
  const [role] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.serverId, serverId)));

  return role;
}

export async function listServerRoles(serverId: string): Promise<PublicRole[]> {
  const rows = await db
    .select()
    .from(roles)
    .where(eq(roles.serverId, serverId))
    .orderBy(asc(roles.position), asc(roles.id));

  return rows.map(serializeRole);
}
