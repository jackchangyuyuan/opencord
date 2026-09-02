import { DM_PERMISSIONS, resolve } from "@opencord/shared/permissions";
import { useQuery } from "@tanstack/react-query";

import {
  channelOverwritesQuery,
  channelQuery,
} from "@/features/channels/api/queries";
import type { ServerMemberEntry } from "@/features/members/api/queries";
import type { PublicRole } from "@/features/roles/api/queries";
import { type ServerDetail, serverQuery } from "@/features/servers/api/queries";
import { currentUserQuery } from "@/features/users/api/queries";

export function has(permissions: number, bit: number): boolean {
  return (permissions & bit) === bit;
}

function resolveServer(
  userId: string | undefined,
  server: ServerDetail | undefined,
): number {
  if (userId === undefined || server === undefined) {
    return 0;
  }

  return resolve({
    userId,
    serverOwnerId: server.ownerId,
    everyoneRole: server.everyoneRole,
    memberRoles: server.roles,
  });
}

export function useServerPermissions(serverId: string | undefined): number {
  const { data: me } = useQuery(currentUserQuery);
  const { data: server } = useQuery({
    ...serverQuery(serverId ?? ""),
    enabled: serverId !== undefined,
  });

  return resolveServer(me?.id, server);
}

export function useChannelPermissions(channelId: string | undefined): number {
  const enabled = channelId !== undefined;

  const { data: me } = useQuery(currentUserQuery);
  const { data: channel } = useQuery({
    ...channelQuery(channelId ?? ""),
    enabled,
  });
  const { data: overwrites } = useQuery({
    ...channelOverwritesQuery(channelId ?? ""),
    enabled: enabled && channel?.serverId != null,
  });
  const { data: server } = useQuery({
    ...serverQuery(channel?.serverId ?? ""),
    enabled: channel?.serverId != null,
  });

  if (channel?.serverId === null) {
    return DM_PERMISSIONS;
  }

  if (me === undefined || server === undefined || overwrites === undefined) {
    return 0;
  }

  const memberOverwrite = overwrites.members.find(
    (entry) => entry.userId === me.id,
  );

  return resolve({
    userId: me.id,
    serverOwnerId: server.ownerId,
    everyoneRole: server.everyoneRole,
    memberRoles: server.roles,
    roleOverwrites: overwrites.roles,
    ...(memberOverwrite === undefined ? {} : { memberOverwrite }),
  });
}

export function highestPosition(
  roleIds: readonly string[],
  roles: readonly PublicRole[],
): number {
  return roleIds.reduce((highest, roleId) => {
    const role = roles.find((candidate) => candidate.id === roleId);

    return role === undefined ? highest : Math.max(highest, role.position);
  }, 0);
}

export function outranks(
  actor: { id: string | undefined; roleIds: readonly string[] },
  target: ServerMemberEntry,
  roles: readonly PublicRole[],
  serverOwnerId: string | undefined,
): boolean {
  if (actor.id === undefined || actor.id === target.user.id) {
    return false;
  }

  if (target.user.id === serverOwnerId) {
    return false;
  }

  if (actor.id === serverOwnerId) {
    return true;
  }

  return (
    highestPosition(target.roleIds, roles) <
    highestPosition(actor.roleIds, roles)
  );
}
