import { Permissions } from "@opencord/shared/permissions";
import { describe, expect, it } from "vitest";

import type { ServerMemberEntry } from "@/features/members/api/queries";
import type { PublicRole } from "@/features/roles/api/queries";

import {
  has,
  highestPosition,
  mayDeleteMessage,
  outranks,
} from "./use-permissions";

const ROLES: PublicRole[] = [
  {
    id: "r-everyone",
    name: "@everyone",
    color: null,
    position: 0,
    permissions: Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES,
    isDefault: true,
  },
  {
    id: "r-mod",
    name: "Moderator",
    color: null,
    position: 5,
    permissions: Permissions.KICK_MEMBERS,
    isDefault: false,
  },
  {
    id: "r-admin",
    name: "Admin",
    color: null,
    position: 9,
    permissions: Permissions.ADMINISTRATOR,
    isDefault: false,
  },
];

function member(id: string, roleIds: string[]): ServerMemberEntry {
  return {
    user: {
      id,
      username: id,
      name: id,
      avatarUrl: null,
      description: null,
      customStatus: null,
      customStatusEmoji: null,
      isGuest: false,
    },
    nickname: null,
    joinedAt: "2026-09-01T00:00:00.000Z",
    roleIds,
  };
}

describe("has", () => {
  it("requires every bit of a compound mask", () => {
    const mask = Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES;

    expect(has(mask, Permissions.SEND_MESSAGES)).toBe(true);
    expect(
      has(mask, Permissions.SEND_MESSAGES | Permissions.MANAGE_CHANNELS),
    ).toBe(false);
  });
});

describe("highestPosition", () => {
  it("takes the highest position a member holds, and 0 for none", () => {
    expect(highestPosition(["r-mod", "r-admin"], ROLES)).toBe(9);
    expect(highestPosition([], ROLES)).toBe(0);
  });

  it("ignores a role id the server does not have", () => {
    expect(highestPosition(["r-mod", "r-ghost"], ROLES)).toBe(5);
  });
});

describe("outranks", () => {
  const owner = "u-owner";

  it("lets a higher role act on a lower one", () => {
    expect(
      outranks(
        { id: "u-mod", roleIds: ["r-admin"] },
        member("u-x", ["r-mod"]),
        ROLES,
        owner,
      ),
    ).toBe(true);
  });

  it("refuses a peer on the same position", () => {
    expect(
      outranks(
        { id: "u-a", roleIds: ["r-mod"] },
        member("u-b", ["r-mod"]),
        ROLES,
        owner,
      ),
    ).toBe(false);
  });

  it("refuses the owner, whatever the actor holds", () => {
    expect(
      outranks(
        { id: "u-admin", roleIds: ["r-admin"] },
        member(owner, []),
        ROLES,
        owner,
      ),
    ).toBe(false);
  });

  it("refuses acting on yourself", () => {
    expect(
      outranks(
        { id: "u-a", roleIds: ["r-admin"] },
        member("u-a", []),
        ROLES,
        owner,
      ),
    ).toBe(false);
  });

  it("lets the owner act on anyone else", () => {
    expect(
      outranks(
        { id: owner, roleIds: [] },
        member("u-admin", ["r-admin"]),
        ROLES,
        owner,
      ),
    ).toBe(true);
  });

  it("refuses when the caller is not known yet", () => {
    expect(
      outranks({ id: undefined, roleIds: [] }, member("u-x", []), ROLES, owner),
    ).toBe(false);
  });
});

describe("mayDeleteMessage", () => {
  const moderator = {
    viewerId: "u-mod",
    permissions: Permissions.MANAGE_MESSAGES,
    isDirectMessage: false,
  };

  it("lets you delete your own message anywhere", () => {
    expect(mayDeleteMessage({ ...moderator, permissions: 0 }, "u-mod")).toBe(
      true,
    );
    expect(
      mayDeleteMessage(
        { ...moderator, permissions: 0, isDirectMessage: true },
        "u-mod",
      ),
    ).toBe(true);
  });

  it("lets the bit delete somebody else's message in a channel", () => {
    expect(mayDeleteMessage(moderator, "u-other")).toBe(true);
  });

  it("refuses somebody else's direct message however the mask reads", () => {
    expect(
      mayDeleteMessage({ ...moderator, isDirectMessage: true }, "u-other"),
    ).toBe(false);
  });

  it("refuses without the bit", () => {
    expect(mayDeleteMessage({ ...moderator, permissions: 0 }, "u-other")).toBe(
      false,
    );
  });

  it("refuses while the session is still loading", () => {
    expect(
      mayDeleteMessage({ ...moderator, viewerId: undefined }, "u-mod"),
    ).toBe(false);
  });
});
