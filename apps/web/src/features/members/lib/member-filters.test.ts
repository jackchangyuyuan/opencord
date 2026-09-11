import { Permissions } from "@opencord/shared/permissions";
import type { PresenceStatus } from "@opencord/shared/types";
import { describe, expect, it } from "vitest";

import type { ServerMemberEntry } from "@/features/members/api/queries";
import {
  filterMembers,
  isAdministrator,
  type MemberFilters,
  memberFiltersActive,
  NO_MEMBER_FILTERS,
} from "@/features/members/lib/member-filters";
import type { PublicRole } from "@/features/roles/api/queries";

const NOW = Date.parse("2026-09-16T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

const ADMIN_ROLE: PublicRole = {
  id: "r-admin",
  name: "Admins",
  color: null,
  position: 2,
  permissions: Permissions.ADMINISTRATOR,
  isDefault: false,
};

const MOD_ROLE: PublicRole = {
  id: "r-mod",
  name: "Moderators",
  color: null,
  position: 1,
  permissions: Permissions.KICK_MEMBERS,
  isDefault: false,
};

const ROLES = [ADMIN_ROLE, MOD_ROLE];

function member(
  id: string,
  overrides: {
    roleIds?: string[];
    isGuest?: boolean;
    joinedAt?: string;
  } = {},
): ServerMemberEntry {
  return {
    user: {
      id,
      username: id,
      name: id,
      avatarUrl: null,
      description: null,
      customStatus: null,
      customStatusEmoji: null,
      isGuest: overrides.isGuest ?? false,
    },
    nickname: null,
    joinedAt: overrides.joinedAt ?? "2020-01-01T00:00:00.000Z",
    roleIds: overrides.roleIds ?? [],
  };
}

const ADA = member("ada", { roleIds: [ADMIN_ROLE.id] });
const GRACE = member("grace", { roleIds: [MOD_ROLE.id] });
const VISITOR = member("visitor", { isGuest: true });
const NEWCOMER = member("newcomer", {
  joinedAt: new Date(NOW - 2 * DAY).toISOString(),
});

const EVERYONE = [ADA, GRACE, VISITOR, NEWCOMER];

function run(
  filters: Partial<MemberFilters>,
  online: Record<string, PresenceStatus> = {},
) {
  return filterMembers({
    filters: { ...NO_MEMBER_FILTERS, ...filters },
    members: EVERYONE,
    now: NOW,
    ownerId: "ada",
    roles: ROLES,
    statusOf: (userId) => online[userId] ?? "offline",
  }).map((entry) => entry.user.id);
}

describe("memberFiltersActive", () => {
  it("is false for the untouched set and true for any one switch", () => {
    expect(memberFiltersActive(NO_MEMBER_FILTERS)).toBe(false);
    expect(memberFiltersActive({ ...NO_MEMBER_FILTERS, guest: true })).toBe(
      true,
    );
    expect(
      memberFiltersActive({ ...NO_MEMBER_FILTERS, roleIds: ["r-mod"] }),
    ).toBe(true);
  });
});

describe("isAdministrator", () => {
  it("reads the bit off the roles a member actually holds", () => {
    expect(isAdministrator(ADA, ROLES)).toBe(true);
    expect(isAdministrator(GRACE, ROLES)).toBe(false);
  });

  it("does not treat the owner as an administrator", () => {
    expect(isAdministrator(member("ada"), ROLES)).toBe(false);
  });
});

describe("filterMembers", () => {
  it("returns everybody when nothing is set", () => {
    expect(run({})).toEqual(["ada", "grace", "visitor", "newcomer"]);
  });

  it("matches any of the chosen roles rather than all of them", () => {
    expect(run({ roleIds: [ADMIN_ROLE.id, MOD_ROLE.id] })).toEqual([
      "ada",
      "grace",
    ]);
  });

  it("narrows by presence, which only the client knows", () => {
    expect(run({ statuses: ["online"] }, { grace: "online" })).toEqual([
      "grace",
    ]);
  });

  it("tells the owner from an administrator", () => {
    expect(run({ owner: true })).toEqual(["ada"]);
    expect(run({ admin: true })).toEqual(["ada"]);
    expect(run({ owner: true, admin: true })).toEqual(["ada"]);
  });

  it("finds the accounts that are still guests", () => {
    expect(run({ guest: true })).toEqual(["visitor"]);
  });

  it("counts the joined window back from the clock it was given", () => {
    expect(run({ joined: "7" })).toEqual(["newcomer"]);
    expect(run({ joined: "30" })).toEqual(["newcomer"]);
  });

  it("intersects filters that are set together", () => {
    expect(run({ roleIds: [MOD_ROLE.id], owner: true })).toEqual([]);
    expect(
      run(
        { roleIds: [MOD_ROLE.id], statuses: ["online"] },
        { grace: "online" },
      ),
    ).toEqual(["grace"]);
  });
});
