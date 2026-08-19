import { ALL_PERMISSIONS, Permissions } from "./bits.js";

export interface ResolvableRole {
  id: string;
  permissions: number;
}

export interface PermissionOverwrite {
  allow: number;
  deny: number;
}

export interface RolePermissionOverwrite extends PermissionOverwrite {
  roleId: string;
}

export interface ResolveInput {
  userId: string;
  serverOwnerId: string;
  everyoneRole: ResolvableRole;
  memberRoles: readonly ResolvableRole[];
  roleOverwrites?: readonly RolePermissionOverwrite[];
  memberOverwrite?: PermissionOverwrite;
}

function apply(permissions: number, allow: number, deny: number): number {
  return (permissions & ~deny) | allow;
}

export function resolve(input: ResolveInput): number {
  const {
    userId,
    serverOwnerId,
    everyoneRole,
    memberRoles,
    roleOverwrites = [],
    memberOverwrite,
  } = input;

  if (userId === serverOwnerId) {
    return ALL_PERMISSIONS;
  }

  let permissions = everyoneRole.permissions;
  for (const role of memberRoles) {
    permissions |= role.permissions;
  }

  if ((permissions & Permissions.ADMINISTRATOR) !== 0) {
    return ALL_PERMISSIONS;
  }

  const everyoneOverwrite = roleOverwrites.find(
    (overwrite) => overwrite.roleId === everyoneRole.id,
  );
  if (everyoneOverwrite !== undefined) {
    permissions = apply(
      permissions,
      everyoneOverwrite.allow,
      everyoneOverwrite.deny,
    );
  }

  const memberRoleIds = new Set(memberRoles.map((role) => role.id));
  let allow = 0;
  let deny = 0;
  for (const overwrite of roleOverwrites) {
    if (
      overwrite.roleId !== everyoneRole.id &&
      memberRoleIds.has(overwrite.roleId)
    ) {
      allow |= overwrite.allow;
      deny |= overwrite.deny;
    }
  }
  permissions = apply(permissions, allow, deny);

  if (memberOverwrite !== undefined) {
    permissions = apply(
      permissions,
      memberOverwrite.allow,
      memberOverwrite.deny,
    );
  }

  if ((permissions & Permissions.VIEW_CHANNEL) === 0) {
    return 0;
  }

  return permissions;
}
