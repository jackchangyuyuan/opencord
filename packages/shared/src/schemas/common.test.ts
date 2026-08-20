import { describe, expect, it } from "vitest";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants/index.js";
import { paginationSchema, usernameSchema } from "./common.js";

describe("usernameSchema", () => {
  it("lowercases and trims", () => {
    expect(usernameSchema.parse("  AdaLovelace  ")).toBe("adalovelace");
  });

  it("accepts the documented character set", () => {
    expect(usernameSchema.parse("ada_love.lace-1")).toBe("ada_love.lace-1");
  });

  it.each(["ab", "a".repeat(33), "ada lovelace", "ada!", "adaü"])(
    "rejects %o",
    (username) => {
      expect(usernameSchema.safeParse(username).success).toBe(false);
    },
  );

  it.each(["guest-abc", "former-guest-abc", "GUEST-abc"])(
    "rejects the reserved name %o",
    (username) => {
      expect(usernameSchema.safeParse(username).success).toBe(false);
    },
  );

  it("does not reserve the bare words", () => {
    expect(usernameSchema.parse("guest")).toBe("guest");
  });
});

describe("paginationSchema", () => {
  it("defaults the limit", () => {
    expect(paginationSchema.parse({})).toEqual({ limit: DEFAULT_PAGE_SIZE });
  });

  it("coerces a query-string limit", () => {
    expect(paginationSchema.parse({ limit: "25" })).toEqual({ limit: 25 });
  });

  it("carries the cursor through", () => {
    expect(paginationSchema.parse({ cursor: "abc", limit: "1" })).toEqual({
      cursor: "abc",
      limit: 1,
    });
  });

  it.each([0, -1, 1.5, MAX_PAGE_SIZE + 1])("rejects a limit of %o", (limit) => {
    expect(paginationSchema.safeParse({ limit }).success).toBe(false);
  });
});
