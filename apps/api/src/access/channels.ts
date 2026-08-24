import { Permissions, resolve } from "@opencord/shared/permissions";
import { and, eq, inArray } from "drizzle-orm";

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

export async function resolveAccessibleChannels(
  userId: string,
): Promise<Set<string>> {
  const memberships = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(eq(serverMembers.userId, userId));

  const serverIds = memberships.map((membership) => membership.serverId);
  const accessible = new Set<string>();

  if (serverIds.length === 0) {
    return accessible;
  }

  const serverRows = await db
    .select({ id: servers.id, ownerId: servers.ownerId })
    .from(servers)
    .where(inArray(servers.id, serverIds));

  const roleRows = await db
    .select({
      id: roles.id,
      serverId: roles.serverId,
      permissions: roles.permissions,
      isDefault: roles.isDefault,
      heldBy: memberRoles.userId,
    })
    .from(roles)
    .leftJoin(
      memberRoles,
      and(eq(memberRoles.roleId, roles.id), eq(memberRoles.userId, userId)),
    )
    .where(inArray(roles.serverId, serverIds));

  const channelRows = await db
    .select({ id: channels.id, serverId: channels.serverId })
    .from(channels)
    .where(inArray(channels.serverId, serverIds));

  const roleOverwriteRows = await db
    .select({
      channelId: channelRoleOverwrites.channelId,
      roleId: channelRoleOverwrites.roleId,
      allow: channelRoleOverwrites.allow,
      deny: channelRoleOverwrites.deny,
    })
    .from(channelRoleOverwrites)
    .where(inArray(channelRoleOverwrites.serverId, serverIds));

  const memberOverwriteRows = await db
    .select({
      channelId: channelMemberOverwrites.channelId,
      allow: channelMemberOverwrites.allow,
      deny: channelMemberOverwrites.deny,
    })
    .from(channelMemberOverwrites)
    .where(
      and(
        inArray(channelMemberOverwrites.serverId, serverIds),
        eq(channelMemberOverwrites.userId, userId),
      ),
    );

  for (const server of serverRows) {
    const serverRoles = roleRows.filter((role) => role.serverId === server.id);
    const everyoneRole = serverRoles.find((role) => role.isDefault);

    if (everyoneRole === undefined) {
      continue;
    }

    const memberRoleRows = serverRoles.filter((role) => role.heldBy !== null);

    for (const channel of channelRows.filter(
      (row) => row.serverId === server.id,
    )) {
      const memberOverwrite = memberOverwriteRows.find(
        (row) => row.channelId === channel.id,
      );

      const permissions = resolve({
        userId,
        serverOwnerId: server.ownerId,
        everyoneRole,
        memberRoles: memberRoleRows,
        roleOverwrites: roleOverwriteRows.filter(
          (row) => row.channelId === channel.id,
        ),
        ...(memberOverwrite === undefined ? {} : { memberOverwrite }),
      });

      if ((permissions & Permissions.VIEW_CHANNEL) !== 0) {
        accessible.add(channel.id);
      }
    }
  }

  return accessible;
}

export async function resolveChannelPermissions(
  userId: string,
  channelId: string,
): Promise<number | null> {
  const channel = await db.query.channels.findFirst({
    columns: { id: true, serverId: true },
    where: { id: channelId },
  });

  if (channel?.serverId == null) {
    return null;
  }

  const server = await db.query.servers.findFirst({
    columns: { id: true, ownerId: true },
    where: { id: channel.serverId },
  });

  if (server === undefined) {
    return null;
  }

  const membership = await db
    .select({ userId: serverMembers.userId })
    .from(serverMembers)
    .where(
      and(
        eq(serverMembers.serverId, server.id),
        eq(serverMembers.userId, userId),
      ),
    );

  if (membership.length === 0) {
    return null;
  }

  const roleRows = await db
    .select({
      id: roles.id,
      permissions: roles.permissions,
      isDefault: roles.isDefault,
      heldBy: memberRoles.userId,
    })
    .from(roles)
    .leftJoin(
      memberRoles,
      and(eq(memberRoles.roleId, roles.id), eq(memberRoles.userId, userId)),
    )
    .where(eq(roles.serverId, server.id));

  const everyoneRole = roleRows.find((role) => role.isDefault);

  if (everyoneRole === undefined) {
    return null;
  }

  const roleOverwrites = await db
    .select({
      roleId: channelRoleOverwrites.roleId,
      allow: channelRoleOverwrites.allow,
      deny: channelRoleOverwrites.deny,
    })
    .from(channelRoleOverwrites)
    .where(eq(channelRoleOverwrites.channelId, channel.id));

  const [memberOverwrite] = await db
    .select({
      allow: channelMemberOverwrites.allow,
      deny: channelMemberOverwrites.deny,
    })
    .from(channelMemberOverwrites)
    .where(
      and(
        eq(channelMemberOverwrites.channelId, channel.id),
        eq(channelMemberOverwrites.userId, userId),
      ),
    );

  return resolve({
    userId,
    serverOwnerId: server.ownerId,
    everyoneRole,
    memberRoles: roleRows.filter((role) => role.heldBy !== null),
    roleOverwrites,
    ...(memberOverwrite === undefined ? {} : { memberOverwrite }),
  });
}
