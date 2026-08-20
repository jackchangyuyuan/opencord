import { resolve } from "@opencord/shared/permissions";
import { and, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  channels,
  memberRoles,
  roles,
  serverMembers,
  servers,
} from "../db/schema/index.js";
import { forbidden, notFound } from "../lib/errors.js";

export type ServerRow = typeof servers.$inferSelect;
export type RoleRow = typeof roles.$inferSelect;
export type ChannelRow = typeof channels.$inferSelect;

export interface ServerContext {
  server: ServerRow;
  everyoneRole: RoleRow;
  memberRoles: RoleRow[];
  permissions: number;
}

export async function loadServerContext(
  serverId: string,
  userId: string,
): Promise<ServerContext> {
  const server = await db.query.servers.findFirst({ where: { id: serverId } });

  if (server === undefined) {
    throw notFound("NOT_FOUND", "Server not found");
  }

  const membership = await db
    .select({ userId: serverMembers.userId })
    .from(serverMembers)
    .where(
      and(
        eq(serverMembers.serverId, serverId),
        eq(serverMembers.userId, userId),
      ),
    );

  if (membership.length === 0) {
    throw forbidden();
  }

  const rows = await db
    .select({ role: roles, heldBy: memberRoles.userId })
    .from(roles)
    .leftJoin(
      memberRoles,
      and(eq(memberRoles.roleId, roles.id), eq(memberRoles.userId, userId)),
    )
    .where(eq(roles.serverId, serverId))
    .orderBy(roles.position, roles.id);

  const everyoneRole = rows.find((row) => row.role.isDefault);

  if (everyoneRole === undefined) {
    throw notFound("NOT_FOUND", "Server not found");
  }

  const held = rows.filter((row) => row.heldBy !== null).map((row) => row.role);

  return {
    server,
    everyoneRole: everyoneRole.role,
    memberRoles: held,
    permissions: resolve({
      userId,
      serverOwnerId: server.ownerId,
      everyoneRole: everyoneRole.role,
      memberRoles: held,
    }),
  };
}
