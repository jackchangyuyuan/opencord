import { Permissions } from "@opencord/shared/permissions";
import type { PresenceStatus } from "@opencord/shared/types";

import type { ServerMemberEntry } from "@/features/members/api/queries";
import type { PublicRole } from "@/features/roles/api/queries";

export const RECENT_WINDOWS = [
  { value: "7", label: "Joined in the last 7 days", days: 7 },
  { value: "30", label: "Joined in the last 30 days", days: 30 },
] as const;

export type RecentWindow = (typeof RECENT_WINDOWS)[number]["value"];

export interface MemberFilters {
  roleIds: string[];
  statuses: PresenceStatus[];
  owner: boolean;
  admin: boolean;
  guest: boolean;
  joined: RecentWindow | null;
}

export const NO_MEMBER_FILTERS: MemberFilters = {
  roleIds: [],
  statuses: [],
  owner: false,
  admin: false,
  guest: false,
  joined: null,
};

export function memberFiltersActive(filters: MemberFilters): boolean {
  return (
    filters.roleIds.length > 0 ||
    filters.statuses.length > 0 ||
    filters.owner ||
    filters.admin ||
    filters.guest ||
    filters.joined !== null
  );
}

export function isAdministrator(
  member: ServerMemberEntry,
  roles: readonly PublicRole[],
): boolean {
  return member.roleIds.some((roleId) => {
    const role = roles.find((entry) => entry.id === roleId);

    return (
      role !== undefined &&
      (role.permissions & Permissions.ADMINISTRATOR) ===
        Permissions.ADMINISTRATOR
    );
  });
}

function joinedWithin(joinedAt: string, days: number, now: number): boolean {
  const at = new Date(joinedAt).getTime();

  return !Number.isNaN(at) && now - at <= days * 24 * 60 * 60 * 1000;
}

export function filterMembers({
  filters,
  members,
  now = Date.now(),
  ownerId,
  roles,
  statusOf,
}: {
  filters: MemberFilters;
  members: readonly ServerMemberEntry[];
  now?: number;
  ownerId: string | undefined;
  roles: readonly PublicRole[];
  statusOf: (userId: string) => PresenceStatus;
}): ServerMemberEntry[] {
  const window = RECENT_WINDOWS.find((entry) => entry.value === filters.joined);

  return members.filter((member) => {
    if (
      filters.roleIds.length > 0 &&
      !filters.roleIds.some((roleId) => member.roleIds.includes(roleId))
    ) {
      return false;
    }

    if (
      filters.statuses.length > 0 &&
      !filters.statuses.includes(statusOf(member.user.id))
    ) {
      return false;
    }

    if (filters.owner && member.user.id !== ownerId) {
      return false;
    }

    if (filters.admin && !isAdministrator(member, roles)) {
      return false;
    }

    if (filters.guest && !member.user.isGuest) {
      return false;
    }

    return !(
      window !== undefined && !joinedWithin(member.joinedAt, window.days, now)
    );
  });
}
