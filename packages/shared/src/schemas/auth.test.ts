import { describe, expect, it } from "vitest";

import {
  CUSTOM_STATUS_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
} from "../constants/index.js";
import {
  customStatusEmojiSchema,
  normalizeCustomStatus,
  normalizeProfileText,
  updateProfileSchema,
} from "./auth.js";

describe("normalizeProfileText", () => {
  it("keeps the lines a description was written in", () => {
    expect(normalizeProfileText("first\nsecond")).toBe("first\nsecond");
  });

  it("keeps one blank line and collapses a run of them", () => {
    expect(normalizeProfileText("a\n\nb\n\n\n\nc")).toBe("a\n\nb\n\nc");
  });

  it("strips trailing spaces from every line", () => {
    expect(normalizeProfileText("a   \nb\t\n")).toBe("a\nb");
  });

  it("normalizes CRLF", () => {
    expect(normalizeProfileText("a\r\nb")).toBe("a\nb");
  });

  it("reports whitespace-only text as a clear", () => {
    expect(normalizeProfileText("  \n \n ")).toBeNull();
    expect(normalizeProfileText("")).toBeNull();
  });
});

describe("normalizeCustomStatus", () => {
  it("flattens a status onto one line", () => {
    expect(normalizeCustomStatus("working\non auth")).toBe("working on auth");
  });

  it("keeps an emoji in the text", () => {
    expect(normalizeCustomStatus("shipping bugs 🐛")).toBe("shipping bugs 🐛");
  });

  it("reports whitespace-only text as a clear", () => {
    expect(normalizeCustomStatus("   ")).toBeNull();
  });
});

describe("customStatusEmojiSchema", () => {
  it.each(["🐛", "☕", "🏳️‍🌈", "👍🏽"])("accepts %s", (value) => {
    expect(customStatusEmojiSchema.safeParse(value).success).toBe(true);
  });

  it.each(["nope", "", "1", "🐛 shipping"])("rejects %j", (value) => {
    expect(customStatusEmojiSchema.safeParse(value).success).toBe(false);
  });
});

describe("updateProfileSchema", () => {
  it("distinguishes an omitted field from a cleared one", () => {
    const omitted = updateProfileSchema.parse({ name: "Ada" });
    const cleared = updateProfileSchema.parse({ description: null });

    expect(omitted).not.toHaveProperty("description");
    expect(cleared.description).toBeNull();
  });

  it("refuses a request that names no field", () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it("bounds the description and the custom status", () => {
    expect(
      updateProfileSchema.safeParse({
        description: "x".repeat(DESCRIPTION_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      updateProfileSchema.safeParse({
        description: "x".repeat(DESCRIPTION_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      updateProfileSchema.safeParse({
        customStatus: "x".repeat(CUSTOM_STATUS_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});
