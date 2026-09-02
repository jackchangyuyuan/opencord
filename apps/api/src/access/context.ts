import {
  DM_PERMISSIONS,
  resolve,
  type ResolveInput,
} from "@opencord/shared/permissions";
import { and, eq } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  channelMemberOverwrites,
  channelRoleOverwrites,
  channels,
  memberRoles,
  roles,
  serverMembers,
  servers,
} from "../db/schema/index.js";
import { forbidden, notFound } from "../lib/errors.js";
import { isDmParticipant } from "./channels.js";

export type ServerRow = typeof servers.$inferSelect;
export type RoleRow = typeof roles.$inferSelect;
export type ChannelRow = typeof channels.$inferSelect;

export interface ServerContext {
  server: ServerRow;
  everyoneRole: RoleRow;
  memberRoles: RoleRow[];
  permissions: number;
}

export interface ChannelContext {
  channel: ChannelRow;
  permissions: number;
  server: ServerContext | null;
}

async function loadChannelOverwrites(
  channelId: string,
  userId: string,
): Promise<Pick<ResolveInput, "roleOverwrites" | "memberOverwrite">> {
  const roleOverwrites = await db
    .select({
      roleId: channelRoleOverwrites.roleId,
      allow: channelRoleOverwrites.allow,
      deny: channelRoleOverwrites.deny,
    })
    .from(channelRoleOverwrites)
    .where(eq(channelRoleOverwrites.channelId, channelId));

  const [memberOverwrite] = await db
    .select({
      allow: channelMemberOverwrites.allow,
      deny: channelMemberOverwrites.deny,
    })
    .from(channelMemberOverwrites)
    .where(
      and(
        eq(channelMemberOverwrites.channelId, channelId),
        eq(channelMemberOverwrites.userId, userId),
      ),
    );

  return {
    roleOverwrites,
    ...(memberOverwrite === undefined ? {} : { memberOverwrite }),
  };
}

export async function loadServerContext(
  serverId: string,
  userId: string,
  channelId?: string,
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

  const overwrites =
    channelId === undefined
      ? {}
      : await loadChannelOverwrites(channelId, userId);

  return {
    server,
    everyoneRole: everyoneRole.role,
    memberRoles: held,
    permissions: resolve({
      userId,
      serverOwnerId: server.ownerId,
      everyoneRole: everyoneRole.role,
      memberRoles: held,
      ...overwrites,
    }),
  };
}

export async function loadChannelContext(
  channelId: string,
  userId: string,
): Promise<ChannelContext | null> {
  const channel = await db.query.channels.findFirst({
    where: { id: channelId },
  });

  if (channel === undefined) {
    return null;
  }

  if (channel.serverId === null) {
    return (await isDmParticipant(channel.id, userId))
      ? { channel, permissions: DM_PERMISSIONS, server: null }
      : null;
  }

  const server = await loadServerContext(channel.serverId, userId, channel.id);

  return { channel, permissions: server.permissions, server };
}
