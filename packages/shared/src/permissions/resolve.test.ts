import { describe, expect, it } from "vitest";

import {
  ALL_PERMISSIONS,
  CHANNEL_PERMISSIONS,
  isChannelPermission,
  Permissions,
  SERVER_ONLY_PERMISSIONS,
} from "./bits.js";
import { resolve, type ResolveInput } from "./resolve.js";

const OWNER = "user_owner";
const MEMBER = "user_member";
const EVERYONE_ROLE = "role_everyone";
const MOD_ROLE = "role_mod";
const OTHER_ROLE = "role_other";

function input(overrides: Partial<ResolveInput> = {}): ResolveInput {
  return {
    userId: MEMBER,
    serverOwnerId: OWNER,
    everyoneRole: { id: EVERYONE_ROLE, permissions: Permissions.VIEW_CHANNEL },
    memberRoles: [],
    ...overrides,
  };
}

describe("ALL_PERMISSIONS", () => {
  it("is the union of the twelve bits", () => {
    expect(ALL_PERMISSIONS).toBe(0b1111_1111_1111);
  });

  it("holds every named bit", () => {
    for (const bit of Object.values(Permissions)) {
      expect(ALL_PERMISSIONS & bit).toBe(bit);
    }
  });
});

describe("Permissions", () => {
  it("assigns one distinct bit per permission", () => {
    const bits = Object.values(Permissions);
    expect(new Set(bits).size).toBe(bits.length);
    expect(bits).toStrictEqual([
      1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048,
    ]);
  });
});

describe("the channel and server-only split", () => {
  it("is true of exactly the bits an overwrite may carry", () => {
    for (const bit of [
      Permissions.VIEW_CHANNEL,
      Permissions.SEND_MESSAGES,
      Permissions.ADD_REACTIONS,
      Permissions.MENTION_EVERYONE,
      Permissions.MANAGE_MESSAGES,
      Permissions.MANAGE_CHANNELS,
      Permissions.MANAGE_ROLES,
    ]) {
      expect(isChannelPermission(bit)).toBe(true);
    }
  });

  it("is false of every bit resolved at server scope", () => {
    for (const bit of [
      Permissions.MANAGE_SERVER,
      Permissions.KICK_MEMBERS,
      Permissions.BAN_MEMBERS,
      Permissions.CREATE_INVITE,
      Permissions.ADMINISTRATOR,
    ]) {
      expect(isChannelPermission(bit)).toBe(false);
    }
  });

  it("is false of a mask mixing the two, rather than true of its channel half", () => {
    expect(
      isChannelPermission(Permissions.VIEW_CHANNEL | Permissions.BAN_MEMBERS),
    ).toBe(false);
  });

  it("partitions every named bit between the two sets", () => {
    expect(CHANNEL_PERMISSIONS & SERVER_ONLY_PERMISSIONS).toBe(0);
    expect(CHANNEL_PERMISSIONS | SERVER_ONLY_PERMISSIONS).toBe(ALL_PERMISSIONS);
  });
});

describe("resolve — step 1, the owner", () => {
  it("grants everything to the server owner", () => {
    expect(resolve(input({ userId: OWNER }))).toBe(ALL_PERMISSIONS);
  });

  it("grants everything to the owner even when @everyone denies VIEW_CHANNEL", () => {
    expect(
      resolve(
        input({
          userId: OWNER,
          everyoneRole: { id: EVERYONE_ROLE, permissions: 0 },
          memberOverwrite: { allow: 0, deny: ALL_PERMISSIONS },
        }),
      ),
    ).toBe(ALL_PERMISSIONS);
  });
});

describe("resolve — step 2, the role union", () => {
  it("returns the @everyone permissions for a member with no other role", () => {
    expect(
      resolve(
        input({
          everyoneRole: {
            id: EVERYONE_ROLE,
            permissions: Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES,
          },
        }),
      ),
    ).toBe(Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES);
  });

  it("unions every role the member holds on top of @everyone", () => {
    expect(
      resolve(
        input({
          memberRoles: [
            { id: MOD_ROLE, permissions: Permissions.MANAGE_MESSAGES },
            { id: OTHER_ROLE, permissions: Permissions.KICK_MEMBERS },
          ],
        }),
      ),
    ).toBe(
      Permissions.VIEW_CHANNEL |
        Permissions.MANAGE_MESSAGES |
        Permissions.KICK_MEMBERS,
    );
  });
});

describe("resolve — step 3, ADMINISTRATOR", () => {
  it("grants everything when a role carries ADMINISTRATOR", () => {
    expect(
      resolve(
        input({
          memberRoles: [
            { id: MOD_ROLE, permissions: Permissions.ADMINISTRATOR },
          ],
        }),
      ),
    ).toBe(ALL_PERMISSIONS);
  });

  it("grants everything when @everyone carries ADMINISTRATOR", () => {
    expect(
      resolve(
        input({
          everyoneRole: {
            id: EVERYONE_ROLE,
            permissions: Permissions.ADMINISTRATOR,
          },
        }),
      ),
    ).toBe(ALL_PERMISSIONS);
  });

  it("ignores channel overwrites once ADMINISTRATOR has short-circuited", () => {
    expect(
      resolve(
        input({
          memberRoles: [
            { id: MOD_ROLE, permissions: Permissions.ADMINISTRATOR },
          ],
          roleOverwrites: [
            { roleId: EVERYONE_ROLE, allow: 0, deny: ALL_PERMISSIONS },
          ],
          memberOverwrite: { allow: 0, deny: ALL_PERMISSIONS },
        }),
      ),
    ).toBe(ALL_PERMISSIONS);
  });
});

describe("resolve — step 4a, the @everyone overwrite", () => {
  it("applies deny then allow from the @everyone overwrite", () => {
    expect(
      resolve(
        input({
          everyoneRole: {
            id: EVERYONE_ROLE,
            permissions: Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES,
          },
          roleOverwrites: [
            {
              roleId: EVERYONE_ROLE,
              allow: Permissions.ADD_REACTIONS,
              deny: Permissions.SEND_MESSAGES,
            },
          ],
        }),
      ),
    ).toBe(Permissions.VIEW_CHANNEL | Permissions.ADD_REACTIONS);
  });

  it("lets allow win over deny within one overwrite", () => {
    expect(
      resolve(
        input({
          roleOverwrites: [
            {
              roleId: EVERYONE_ROLE,
              allow: Permissions.SEND_MESSAGES,
              deny: Permissions.SEND_MESSAGES,
            },
          ],
        }),
      ),
    ).toBe(Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES);
  });
});

describe("resolve — step 4b, the member's other role overwrites", () => {
  it("unions the overwrites of the roles the member holds", () => {
    expect(
      resolve(
        input({
          memberRoles: [{ id: MOD_ROLE, permissions: 0 }],
          roleOverwrites: [
            {
              roleId: MOD_ROLE,
              allow: Permissions.MANAGE_MESSAGES,
              deny: 0,
            },
          ],
        }),
      ),
    ).toBe(Permissions.VIEW_CHANNEL | Permissions.MANAGE_MESSAGES);
  });

  it("ignores overwrites for roles the member does not hold", () => {
    expect(
      resolve(
        input({
          memberRoles: [{ id: MOD_ROLE, permissions: 0 }],
          roleOverwrites: [
            {
              roleId: OTHER_ROLE,
              allow: Permissions.MANAGE_MESSAGES,
              deny: 0,
            },
          ],
        }),
      ),
    ).toBe(Permissions.VIEW_CHANNEL);
  });

  it("overrides an @everyone deny with a role allow", () => {
    expect(
      resolve(
        input({
          memberRoles: [{ id: MOD_ROLE, permissions: 0 }],
          roleOverwrites: [
            {
              roleId: EVERYONE_ROLE,
              allow: 0,
              deny: Permissions.SEND_MESSAGES,
            },
            {
              roleId: MOD_ROLE,
              allow: Permissions.SEND_MESSAGES,
              deny: 0,
            },
          ],
          everyoneRole: {
            id: EVERYONE_ROLE,
            permissions: Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES,
          },
        }),
      ),
    ).toBe(Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES);
  });

  it("lets a union of allow across roles win over a deny in the same layer", () => {
    expect(
      resolve(
        input({
          memberRoles: [
            { id: MOD_ROLE, permissions: 0 },
            { id: OTHER_ROLE, permissions: 0 },
          ],
          roleOverwrites: [
            { roleId: MOD_ROLE, allow: 0, deny: Permissions.SEND_MESSAGES },
            { roleId: OTHER_ROLE, allow: Permissions.SEND_MESSAGES, deny: 0 },
          ],
          everyoneRole: {
            id: EVERYONE_ROLE,
            permissions: Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES,
          },
        }),
      ),
    ).toBe(Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES);
  });
});

describe("resolve — step 4c, the member overwrite", () => {
  it("applies last and overrides a role-layer allow", () => {
    expect(
      resolve(
        input({
          memberRoles: [{ id: MOD_ROLE, permissions: 0 }],
          roleOverwrites: [
            { roleId: MOD_ROLE, allow: Permissions.SEND_MESSAGES, deny: 0 },
          ],
          memberOverwrite: { allow: 0, deny: Permissions.SEND_MESSAGES },
        }),
      ),
    ).toBe(Permissions.VIEW_CHANNEL);
  });

  it("restores a permission the role layer denied", () => {
    expect(
      resolve(
        input({
          memberRoles: [{ id: MOD_ROLE, permissions: 0 }],
          everyoneRole: {
            id: EVERYONE_ROLE,
            permissions: Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES,
          },
          roleOverwrites: [
            { roleId: MOD_ROLE, allow: 0, deny: Permissions.SEND_MESSAGES },
          ],
          memberOverwrite: { allow: Permissions.SEND_MESSAGES, deny: 0 },
        }),
      ),
    ).toBe(Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES);
  });
});

describe("resolve — step 5, the VIEW_CHANNEL gate", () => {
  it("returns 0 when VIEW_CHANNEL was never granted", () => {
    expect(
      resolve(
        input({
          everyoneRole: {
            id: EVERYONE_ROLE,
            permissions: Permissions.SEND_MESSAGES,
          },
        }),
      ),
    ).toBe(0);
  });

  it("returns 0 when a channel overwrite denies VIEW_CHANNEL, whatever else is granted", () => {
    expect(
      resolve(
        input({
          everyoneRole: {
            id: EVERYONE_ROLE,
            permissions:
              Permissions.VIEW_CHANNEL |
              Permissions.SEND_MESSAGES |
              Permissions.MANAGE_CHANNELS,
          },
          roleOverwrites: [
            {
              roleId: EVERYONE_ROLE,
              allow: 0,
              deny: Permissions.VIEW_CHANNEL,
            },
          ],
        }),
      ),
    ).toBe(0);
  });

  it("returns 0 when the member overwrite denies VIEW_CHANNEL but allows SEND_MESSAGES", () => {
    expect(
      resolve(
        input({
          memberOverwrite: {
            allow: Permissions.SEND_MESSAGES,
            deny: Permissions.VIEW_CHANNEL,
          },
        }),
      ),
    ).toBe(0);
  });
});

describe("resolve with no identity class", () => {
  it("resolves a guest owner exactly as any other owner", () => {
    const guestOwner = resolve(
      input({ userId: "guest_anonymous", serverOwnerId: "guest_anonymous" }),
    );
    expect(guestOwner).toBe(resolve(input({ userId: OWNER })));
  });
});
