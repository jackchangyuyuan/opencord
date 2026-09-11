import { describe, expect, it } from "vitest";

import { inviteExpiry, refreshInterval } from "@/features/invites/lib/expiry";

const NOW = Date.parse("2026-09-16T12:00:00.000Z");

function invite(
  expiresAt: string | null,
  uses = 0,
  maxUses: number | null = null,
) {
  return { expiresAt, uses, maxUses };
}

const at = (ms: number) => new Date(NOW + ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("inviteExpiry", () => {
  it("says so when an invite never expires", () => {
    expect(inviteExpiry(invite(null), NOW)).toEqual({
      state: "never",
      label: "Never expires",
    });
  });

  it("counts down in the unit somebody would use", () => {
    expect(inviteExpiry(invite(at(23 * MINUTE)), NOW).label).toBe(
      "Expires in 23 minutes",
    );
    expect(inviteExpiry(invite(at(6 * HOUR)), NOW).label).toBe(
      "Expires in 6 hours",
    );
    expect(inviteExpiry(invite(at(3 * DAY)), NOW).label).toBe(
      "Expires in 3 days",
    );
  });

  it("does not pluralise a single unit", () => {
    expect(inviteExpiry(invite(at(HOUR + MINUTE)), NOW).label).toBe(
      "Expires in 1 hour",
    );
    expect(inviteExpiry(invite(at(DAY + HOUR)), NOW).label).toBe(
      "Expires in 1 day",
    );
  });

  it("rounds down, so a count never overstates what is left", () => {
    expect(inviteExpiry(invite(at(119 * MINUTE)), NOW).label).toBe(
      "Expires in 1 hour",
    );
  });

  it("never counts below zero", () => {
    for (const ago of [1, MINUTE, HOUR, 400 * DAY]) {
      expect(inviteExpiry(invite(at(-ago)), NOW)).toEqual({
        state: "expired",
        label: "Expired",
      });
    }
  });

  it("treats the exact moment of expiry as expired", () => {
    expect(inviteExpiry(invite(at(0)), NOW).state).toBe("expired");
  });

  it("reports a used-up invite before it reports the clock", () => {
    expect(inviteExpiry(invite(at(3 * DAY), 5, 5), NOW)).toEqual({
      state: "exhausted",
      label: "Used up",
    });
    expect(inviteExpiry(invite(null, 5, 5), NOW).label).toBe("Used up");
  });

  it("leaves an invite with uses remaining alone", () => {
    expect(inviteExpiry(invite(null, 4, 5), NOW).state).toBe("never");
  });

  it("says less than a minute rather than counting seconds", () => {
    expect(inviteExpiry(invite(at(30_000)), NOW).label).toBe(
      "Expires in less than a minute",
    );
  });
});

describe("refreshInterval", () => {
  it("is null when nothing on screen can change", () => {
    expect(refreshInterval([], NOW)).toBeNull();
    expect(refreshInterval([invite(null)], NOW)).toBeNull();
    expect(refreshInterval([invite(at(-HOUR))], NOW)).toBeNull();
    expect(refreshInterval([invite(at(DAY), 5, 5)], NOW)).toBeNull();
  });

  it("ticks at the pace of the most urgent row", () => {
    expect(
      refreshInterval([invite(at(3 * DAY)), invite(at(2 * HOUR))], NOW),
    ).toBe(MINUTE);
    expect(refreshInterval([invite(at(3 * DAY))], NOW)).toBe(HOUR);
  });

  it("never schedules a busy loop", () => {
    expect(refreshInterval([invite(at(10))], NOW)).toBeGreaterThanOrEqual(1000);
  });
});
