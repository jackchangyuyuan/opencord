import { describe, expect, it } from "vitest";

import type {
  AuditAction,
  AuditLogEntry,
} from "@/features/audit-log/api/queries";

import { type AuditNames, describeAudit, relativeTime } from "./describe";

const NOBODY: AuditNames = {
  actor: "Jordan",
  author: null,
  channel: null,
  role: null,
  target: null,
};

function entry(over: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    action: "member_ban",
    actorId: "u-jordan",
    createdAt: "2026-09-11T10:00:00.000Z",
    id: "a-1",
    metadata: null,
    targetId: "u-alex",
    targetType: "user",
    ...over,
  };
}

function sentence(
  over: Partial<AuditLogEntry> = {},
  names: Partial<AuditNames> = {},
): string {
  return describeAudit(entry(over), { ...NOBODY, ...names })
    .parts.map((part) => part.text)
    .join("");
}

const EVERY_ACTION: AuditAction[] = [
  "channel_create",
  "channel_delete",
  "channel_update",
  "invite_create",
  "invite_redeem",
  "member_ban",
  "member_kick",
  "member_unban",
  "message_delete",
  "message_pin",
  "message_unpin",
  "overwrite_delete",
  "overwrite_update",
  "role_assign",
  "role_create",
  "role_delete",
  "role_unassign",
  "role_update",
  "server_transfer",
  "server_update",
];

describe("describeAudit", () => {
  it("says who a ban happened to, and who did it", () => {
    expect(sentence({ action: "member_ban" }, { target: "Alex" })).toBe(
      "Alex was banned by Jordan",
    );
  });

  it("quotes the reason the moderator gave", () => {
    const story = describeAudit(
      entry({
        action: "member_ban",
        metadata: { reason: "Spam and repeated invite links" },
      }),
      { ...NOBODY, target: "Alex" },
    );

    expect(story.reason).toBe("Spam and repeated invite links");
  });

  it("leaves the reason out when none was recorded", () => {
    expect(describeAudit(entry({ action: "member_ban" }), NOBODY).reason).toBe(
      null,
    );
  });

  it("names the role a member was given", () => {
    expect(
      sentence(
        { action: "role_assign", metadata: { roleId: "r-mod" } },
        { role: "Moderator", target: "Alex" },
      ),
    ).toBe("Jordan gave Alex the Moderator role");
  });

  it("names the channel an override was changed in", () => {
    expect(
      sentence(
        {
          action: "overwrite_update",
          metadata: { allow: 1, channelId: "c-1", deny: 0 },
          targetType: "role",
        },
        { channel: "general", role: "Moderator" },
      ),
    ).toBe("Jordan changed what the Moderator role may do in #general");
  });

  it("says what a role update actually did", () => {
    expect(
      describeAudit(
        entry({ action: "role_update", metadata: { name: "Helpers" } }),
        { ...NOBODY, role: "Helper" },
      ).detail,
    ).toBe("Renamed to Helpers");

    expect(
      describeAudit(
        entry({ action: "role_update", metadata: { color: 0x5865f2 } }),
        { ...NOBODY, role: "Helper" },
      ).detail,
    ).toBe("Colour set to Blue");
  });

  it("tells a reorder apart from a rename", () => {
    expect(
      sentence({ action: "role_update", metadata: { reordered: ["a", "b"] } }),
    ).toBe("Jordan reordered the roles");
  });

  it("names the author of a message a moderator deleted", () => {
    expect(
      sentence(
        {
          action: "message_delete",
          metadata: { authorId: "u-alex", channelId: "c-1" },
          targetType: "message",
        },
        { author: "Alex", channel: "general" },
      ),
    ).toBe("Jordan deleted a message from Alex in #general");
  });

  it("says a role is deleted rather than printing its id", () => {
    const story = describeAudit(
      entry({
        action: "role_delete",
        targetId: "01a0a6a8-bebb-7488",
        targetType: "role",
      }),
      NOBODY,
    );
    const text = story.parts.map((part) => part.text).join("");

    expect(text).toBe("Jordan deleted a role that no longer exists");
    expect(text).not.toContain("01a0a6a8");
  });

  it("says a channel is deleted rather than printing its id", () => {
    expect(
      sentence({
        action: "channel_delete",
        targetId: "01a0a6a8-bebe-7b4f",
        targetType: "channel",
      }),
    ).toBe("Jordan deleted a channel that no longer exists");
  });

  it("never leaks an id or an enum for any action the API can emit", () => {
    expect(EVERY_ACTION).toHaveLength(20);

    for (const action of EVERY_ACTION) {
      const text = sentence({
        action,
        metadata: { channelId: "01a0aaaa-1111", roleId: "01a0bbbb-2222" },
        targetId: "01a0cccc-3333",
      });

      expect(text).not.toContain("01a0");
      expect(text).not.toContain("_");
      expect(text.length).toBeGreaterThan(8);
    }
  });

  it("mentions no duration, because none is recorded", () => {
    for (const action of EVERY_ACTION) {
      const story = describeAudit(entry({ action }), NOBODY);
      const text = [story.parts.map((p) => p.text).join(""), story.detail].join(
        " ",
      );

      expect(text).not.toMatch(/timed out|for \d+ (minute|hour|day)/i);
    }
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-09-11T12:00:00.000Z");

  it("counts minutes for something that just happened", () => {
    expect(relativeTime("2026-09-11T11:58:00.000Z", now)).toMatch(/2 minutes/);
  });

  it("counts hours", () => {
    expect(relativeTime("2026-09-11T09:00:00.000Z", now)).toMatch(/3 hours/);
  });

  it("counts days", () => {
    expect(relativeTime("2026-09-08T12:00:00.000Z", now)).toMatch(/3 days/);
  });
});
