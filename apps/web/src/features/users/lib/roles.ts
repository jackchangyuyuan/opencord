import type { PublicRole } from "@/features/roles/api/queries";

export function rolesOf(
  roleIds: readonly string[],
  roles: readonly PublicRole[],
): PublicRole[] {
  const byId = new Map(roles.map((role) => [role.id, role]));

  return roleIds
    .map((roleId) => byId.get(roleId))
    .filter((role): role is PublicRole => role !== undefined && !role.isDefault)
    .sort((a, b) => b.position - a.position);
}
