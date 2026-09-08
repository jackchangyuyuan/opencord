import { describe, expect, it } from "vitest";

import {
  knownTimeZone,
  uuidV7LowerBound,
  zonedDayEnd,
  zonedDayStart,
} from "./time-window.js";

describe("knownTimeZone", () => {
  it("keeps a zone the platform knows", () => {
    expect(knownTimeZone("America/Toronto")).toBe("America/Toronto");
  });

  it("falls back to UTC for nonsense and for nothing", () => {
    expect(knownTimeZone("Mars/Olympus_Mons")).toBe("UTC");
    expect(knownTimeZone(undefined)).toBe("UTC");
  });
});

describe("zonedDayStart", () => {
  it("is midnight UTC when the zone is UTC", () => {
    expect(zonedDayStart("2026-03-14", "UTC").toISOString()).toBe(
      "2026-03-14T00:00:00.000Z",
    );
  });

  it("starts a day at the zone's own midnight", () => {
    expect(zonedDayStart("2026-01-15", "America/Toronto").toISOString()).toBe(
      "2026-01-15T05:00:00.000Z",
    );
  });

  it("follows the zone across a daylight-saving change", () => {
    expect(zonedDayStart("2026-03-07", "America/Toronto").toISOString()).toBe(
      "2026-03-07T05:00:00.000Z",
    );
    expect(zonedDayStart("2026-03-10", "America/Toronto").toISOString()).toBe(
      "2026-03-10T04:00:00.000Z",
    );
  });

  it("handles a zone ahead of UTC", () => {
    expect(zonedDayStart("2026-06-01", "Asia/Tokyo").toISOString()).toBe(
      "2026-05-31T15:00:00.000Z",
    );
  });
});

describe("zonedDayEnd", () => {
  it("is the next day's start, not twenty-four hours on", () => {
    const start = zonedDayStart("2026-03-08", "America/Toronto");
    const end = zonedDayEnd("2026-03-08", "America/Toronto");

    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("is twenty-five hours on the day the clocks go back", () => {
    const start = zonedDayStart("2026-11-01", "America/Toronto");
    const end = zonedDayEnd("2026-11-01", "America/Toronto");

    expect(end.getTime() - start.getTime()).toBe(25 * 60 * 60 * 1000);
  });

  it("rolls into the next month and the next year", () => {
    expect(zonedDayEnd("2026-01-31", "UTC").toISOString()).toBe(
      "2026-02-01T00:00:00.000Z",
    );
    expect(zonedDayEnd("2026-12-31", "UTC").toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
});

describe("uuidV7LowerBound", () => {
  it("is a well-formed uuidv7 carrying the instant", () => {
    const id = uuidV7LowerBound(new Date("2026-03-14T00:00:00.000Z"));

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7000-8000-000000000000$/);

    const ms = Number.parseInt(id.slice(0, 13).replace("-", ""), 16);

    expect(ms).toBe(Date.parse("2026-03-14T00:00:00.000Z"));
  });

  it("sorts below any uuidv7 minted in the same millisecond", () => {
    const at = new Date("2026-03-14T12:34:56.789Z");
    const bound = uuidV7LowerBound(at);
    const hex = at.getTime().toString(16).padStart(12, "0");
    const realistic = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7abc-9def-0123456789ab`;

    expect(bound < realistic).toBe(true);
  });

  it("orders with time", () => {
    expect(
      uuidV7LowerBound(new Date("2025-01-01T00:00:00.000Z")) <
        uuidV7LowerBound(new Date("2026-01-01T00:00:00.000Z")),
    ).toBe(true);
  });
});
