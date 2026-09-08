import { and, asc, count, eq } from "drizzle-orm";

import type { RoleRow, ServerContext } from "../../access/context.js";
import { db } from "../../db/index.js";
import { memberRoles, roles, serverMembers } from "../../db/schema/index.js";

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

export interface ServerRoleSummary extends PublicRole {
  memberCount: number;
}

export async function listServerRoles(
  serverId: string,
): Promise<ServerRoleSummary[]> {
  const [rows, assigned, members] = await Promise.all([
    db
      .select()
      .from(roles)
      .where(eq(roles.serverId, serverId))
      .orderBy(asc(roles.position), asc(roles.id)),
    db
      .select({ roleId: memberRoles.roleId, total: count() })
      .from(memberRoles)
      .where(eq(memberRoles.serverId, serverId))
      .groupBy(memberRoles.roleId),
    db
      .select({ total: count() })
      .from(serverMembers)
      .where(eq(serverMembers.serverId, serverId)),
  ]);

  const byRole = new Map(assigned.map((row) => [row.roleId, row.total]));
  const everyone = members[0]?.total ?? 0;

  return rows.map((role) => ({
    ...serializeRole(role),
    memberCount: role.isDefault ? everyone : (byRole.get(role.id) ?? 0),
  }));
}
