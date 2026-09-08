import { describe, expect, it } from "vitest";

import { parseSearchQuery } from "./query.js";

describe("parseSearchQuery", () => {
  it("leaves a plain query as free text", () => {
    const parsed = parseSearchQuery("deployment postmortem");

    expect(parsed.text).toBe("deployment postmortem");
    expect(parsed.hasFilters).toBe(false);
    expect(parsed.filters).toEqual({
      from: [],
      in: [],
      before: null,
      after: null,
      on: null,
    });
  });

  it("lifts from: and in: out of the free text", () => {
    const parsed = parseSearchQuery("from:@ana in:#general rollback");

    expect(parsed.text).toBe("rollback");
    expect(parsed.hasFilters).toBe(true);
    expect(parsed.filters.from).toEqual(["ana"]);
    expect(parsed.filters.in).toEqual(["general"]);
  });

  it("accepts the sigils being left off", () => {
    const parsed = parseSearchQuery("from:ana in:general");

    expect(parsed.filters.from).toEqual(["ana"]);
    expect(parsed.filters.in).toEqual(["general"]);
  });

  it("collects repeated filters", () => {
    const parsed = parseSearchQuery("in:#general in:#random");

    expect(parsed.filters.in).toEqual(["general", "random"]);
  });

  it("parses the date filters", () => {
    const parsed = parseSearchQuery("before:2026-09-01 after:2026-08-01 x");

    expect(parsed.filters.before).toBe("2026-09-01");
    expect(parsed.filters.after).toBe("2026-08-01");
    expect(parsed.text).toBe("x");
  });

  it("keeps a malformed date as free text rather than dropping it", () => {
    const parsed = parseSearchQuery("before:yesterday");

    expect(parsed.filters.before).toBeNull();
    expect(parsed.hasFilters).toBe(false);
    expect(parsed.text).toBe("before:yesterday");
  });

  it("rejects a calendar date that does not exist", () => {
    const parsed = parseSearchQuery("after:2026-02-31");

    expect(parsed.filters.after).toBeNull();
    expect(parsed.text).toBe("after:2026-02-31");
  });

  it("keeps a quoted phrase whole", () => {
    const parsed = parseSearchQuery('in:#general "ship it" now');

    expect(parsed.text).toBe('"ship it" now');
    expect(parsed.filters.in).toEqual(["general"]);
  });

  it("does not treat a bare colon as a filter", () => {
    const parsed = parseSearchQuery("note: this broke");

    expect(parsed.hasFilters).toBe(false);
    expect(parsed.text).toBe("note: this broke");
  });

  it("ignores a filter with no value", () => {
    const parsed = parseSearchQuery("from: ana");

    expect(parsed.filters.from).toEqual([]);
    expect(parsed.text).toBe("from: ana");
  });

  it("reports filters with no free text", () => {
    const parsed = parseSearchQuery("in:#general from:@ana");

    expect(parsed.text).toBe("");
    expect(parsed.hasFilters).toBe(true);
  });

  it("treats an empty query as neither text nor filters", () => {
    const parsed = parseSearchQuery("   ");

    expect(parsed.text).toBe("");
    expect(parsed.hasFilters).toBe(false);
  });
});

describe("parseSearchQuery — on:", () => {
  it("lifts a single calendar day out of the free text", () => {
    const parsed = parseSearchQuery("on:2026-03-14 rollback");

    expect(parsed.text).toBe("rollback");
    expect(parsed.filters.on).toBe("2026-03-14");
    expect(parsed.hasFilters).toBe(true);
  });

  it("is a filter on its own, with no words to search for", () => {
    expect(parseSearchQuery("on:2026-03-14").hasFilters).toBe(true);
  });

  it("leaves a date that does not exist as free text", () => {
    const parsed = parseSearchQuery("on:2026-02-31");

    expect(parsed.filters.on).toBeNull();
    expect(parsed.text).toBe("on:2026-02-31");
  });

  it("keeps the last of a repeated day", () => {
    expect(parseSearchQuery("on:2026-03-01 on:2026-03-02").filters.on).toBe(
      "2026-03-02",
    );
  });
});
