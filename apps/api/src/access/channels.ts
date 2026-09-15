import { Permissions, resolve } from "@opencord/shared/permissions";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../db/index.js";
import {
  channelMemberOverwrites,
  channelMembers,
  channelRoleOverwrites,
  channels,
  memberRoles,
  roles,
  serverMembers,
  servers,
} from "../db/schema/index.js";

const EVERYONE = "@everyone";
const NOBODY = "";

export async function isDmParticipant(
  channelId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ userId: channelMembers.userId })
    .from(channelMembers)
    .where(
      and(
        eq(channelMembers.channelId, channelId),
        eq(channelMembers.userId, userId),
      ),
    );

  return rows.length > 0;
}

export async function resolvePublicChannels(
  channelIds: readonly string[],
): Promise<Set<string>> {
  const publicChannels = new Set<string>();

  if (channelIds.length === 0) {
    return publicChannels;
  }

  const rows = await db
    .select({ id: channels.id, serverId: channels.serverId })
    .from(channels)
    .where(inArray(channels.id, [...channelIds]));

  const serverIds = [
    ...new Set(
      rows
        .map((row) => row.serverId)
        .filter((serverId): serverId is string => serverId !== null),
    ),
  ];

  if (serverIds.length === 0) {
    return publicChannels;
  }

  const everyoneRoles = await db
    .select({
      id: roles.id,
      serverId: roles.serverId,
      permissions: roles.permissions,
    })
    .from(roles)
    .where(and(inArray(roles.serverId, serverIds), eq(roles.isDefault, true)));

  const overwrites = await db
    .select({
      channelId: channelRoleOverwrites.channelId,
      roleId: channelRoleOverwrites.roleId,
      allow: channelRoleOverwrites.allow,
      deny: channelRoleOverwrites.deny,
    })
    .from(channelRoleOverwrites)
    .where(inArray(channelRoleOverwrites.serverId, serverIds));

  for (const channel of rows) {
    const everyoneRole = everyoneRoles.find(
      (role) => role.serverId === channel.serverId,
    );

    if (everyoneRole === undefined) {
      continue;
    }

    const permissions = resolve({
      userId: EVERYONE,
      serverOwnerId: NOBODY,
      everyoneRole,
      memberRoles: [],
      roleOverwrites: overwrites.filter((row) => row.channelId === channel.id),
    });

    if ((permissions & Permissions.VIEW_CHANNEL) !== 0) {
      publicChannels.add(channel.id);
    }
  }

  return publicChannels;
}

export async function resolveAccessibleChannelsByUser(
  userIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const unique = [...new Set(userIds)];
  const accessible = new Map<string, Set<string>>(
    unique.map((userId) => [userId, new Set<string>()]),
  );

  if (unique.length === 0) {
    return accessible;
  }

  const memberships = await db
    .select({ userId: serverMembers.userId, serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(inArray(serverMembers.userId, unique));

  const dmRows = await db
    .select({
      userId: channelMembers.userId,
      channelId: channelMembers.channelId,
    })
    .from(channelMembers)
    .where(inArray(channelMembers.userId, unique));

  for (const row of dmRows) {
    accessible.get(row.userId)?.add(row.channelId);
  }

  const serverIds = [
    ...new Set(memberships.map((membership) => membership.serverId)),
  ];

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
    })
    .from(roles)
    .where(inArray(roles.serverId, serverIds));

  const heldRows = await db
    .select({ userId: memberRoles.userId, roleId: memberRoles.roleId })
    .from(memberRoles)
    .where(
      and(
        inArray(memberRoles.serverId, serverIds),
        inArray(memberRoles.userId, unique),
      ),
    );

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
      userId: channelMemberOverwrites.userId,
      channelId: channelMemberOverwrites.channelId,
      allow: channelMemberOverwrites.allow,
      deny: channelMemberOverwrites.deny,
    })
    .from(channelMemberOverwrites)
    .where(
      and(
        inArray(channelMemberOverwrites.serverId, serverIds),
        inArray(channelMemberOverwrites.userId, unique),
      ),
    );

  const held = new Set(heldRows.map((row) => `${row.userId}:${row.roleId}`));
  const serverById = new Map(serverRows.map((row) => [row.id, row]));
  const rolesByServer = Map.groupBy(roleRows, (row) => row.serverId);
  const channelsByServer = Map.groupBy(channelRows, (row) => row.serverId);
  const roleOverwritesByChannel = Map.groupBy(
    roleOverwriteRows,
    (row) => row.channelId,
  );
  const memberOverwriteByKey = new Map(
    memberOverwriteRows.map((row) => [`${row.userId}:${row.channelId}`, row]),
  );

  for (const membership of memberships) {
    const server = serverById.get(membership.serverId);
    const serverRoles = rolesByServer.get(membership.serverId) ?? [];
    const everyoneRole = serverRoles.find((role) => role.isDefault);

    if (server === undefined || everyoneRole === undefined) {
      continue;
    }

    const memberRoleRows = serverRoles.filter((role) =>
      held.has(`${membership.userId}:${role.id}`),
    );

    for (const channel of channelsByServer.get(membership.serverId) ?? []) {
      const memberOverwrite = memberOverwriteByKey.get(
        `${membership.userId}:${channel.id}`,
      );

      const permissions = resolve({
        userId: membership.userId,
        serverOwnerId: server.ownerId,
        everyoneRole,
        memberRoles: memberRoleRows,
        roleOverwrites: roleOverwritesByChannel.get(channel.id) ?? [],
        ...(memberOverwrite === undefined ? {} : { memberOverwrite }),
      });

      if ((permissions & Permissions.VIEW_CHANNEL) !== 0) {
        accessible.get(membership.userId)?.add(channel.id);
      }
    }
  }

  return accessible;
}

export async function resolveAccessibleChannels(
  userId: string,
): Promise<Set<string>> {
  return (
    (await resolveAccessibleChannelsByUser([userId])).get(userId) ?? new Set()
  );
}
