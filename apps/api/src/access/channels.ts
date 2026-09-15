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

export async function resolveAccessibleChannels(
  userId: string,
): Promise<Set<string>> {
  const memberships = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(eq(serverMembers.userId, userId));

  const serverIds = memberships.map((membership) => membership.serverId);
  const accessible = new Set<string>();

  const dmRows = await db
    .select({ channelId: channelMembers.channelId })
    .from(channelMembers)
    .where(eq(channelMembers.userId, userId));

  for (const row of dmRows) {
    accessible.add(row.channelId);
  }

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
