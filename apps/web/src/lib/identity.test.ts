import { describe, expect, it } from "vitest";

import {
  bareTerm,
  isHandleTerm,
  matchesIdentity,
  rankSuggestions,
  toHandle,
} from "@/lib/identity";

const ADA = { id: "u-ada", username: "ada", name: "Ada Lovelace" };
const KONRAD = { id: "u-konrad", username: "konrad", name: "Konrad Zuse" };
const IMPOSTOR = {
  id: "u-impostor",
  username: "impostor",
  name: "Ada Lovelace",
};

describe("isHandleTerm", () => {
  it("reads a leading @ as a request for the unique identifier", () => {
    expect(isHandleTerm("@ada")).toBe(true);
    expect(isHandleTerm("  @ada")).toBe(true);
    expect(isHandleTerm("ada")).toBe(false);
    expect(isHandleTerm("")).toBe(false);
  });
});

describe("bareTerm", () => {
  it("strips the sigil the API does not understand", () => {
    expect(bareTerm("@ada")).toBe("ada");
    expect(bareTerm(" @ada ")).toBe("ada");
    expect(bareTerm("ada")).toBe("ada");
    expect(bareTerm("@")).toBe("");
  });
});

describe("matchesIdentity", () => {
  it("matches everybody on an empty term", () => {
    expect(matchesIdentity("", ADA)).toBe(true);
    expect(matchesIdentity("  ", ADA)).toBe(true);
  });

  it("searches the handle and the display name on a bare term", () => {
    expect(matchesIdentity("ada", ADA)).toBe(true);
    expect(matchesIdentity("lovelace", ADA)).toBe(true);
    expect(matchesIdentity("zuse", ADA)).toBe(false);
  });

  it("searches the handle alone once the @ is typed", () => {
    expect(matchesIdentity("@ada", ADA)).toBe(true);
    expect(matchesIdentity("@ada", IMPOSTOR)).toBe(false);
    expect(matchesIdentity("ada", IMPOSTOR)).toBe(true);
    expect(matchesIdentity("ada", ADA)).toBe(true);
  });

  it("matches a handle by substring, not only by prefix", () => {
    expect(
      matchesIdentity("@ada", { username: "ada-two", name: "Somebody" }),
    ).toBe(true);
  });

  it("searches a server nickname too, where there is one", () => {
    expect(
      matchesIdentity("countess", { ...ADA, nickname: "The Countess" }),
    ).toBe(true);
    expect(
      matchesIdentity("@countess", { ...ADA, nickname: "The Countess" }),
    ).toBe(false);
  });
});

describe("rankSuggestions", () => {
  it("puts a prefix match above a substring one", () => {
    const ranked = rankSuggestions("@ad", [
      { id: "u-konrad", username: "konrad", name: "Konrad Zuse" },
      ADA,
    ]);

    expect(ranked.map((entry) => entry.username)).toEqual(["ada", "konrad"]);
  });

  it("offers everybody while the term is only the sigil", () => {
    expect(rankSuggestions("@", [ADA, KONRAD])).toHaveLength(2);
  });

  it("finds a candidate by display name as well as by handle", () => {
    expect(
      rankSuggestions("@zuse", [ADA, KONRAD]).map((entry) => entry.username),
    ).toEqual(["konrad"]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      id: `u-${String(index)}`,
      username: `member-${String(index)}`,
      name: `Member ${String(index)}`,
    }));

    expect(rankSuggestions("@member", many).length).toBeLessThanOrEqual(6);
  });

  it("orders ties by handle so the list does not reshuffle mid-keystroke", () => {
    const ranked = rankSuggestions("@", [KONRAD, ADA]);

    expect(ranked.map((entry) => entry.username)).toEqual(["ada", "konrad"]);
  });
});

describe("handle", () => {
  it("is the one spelling of a person this area shows", () => {
    expect(toHandle("ada")).toBe("@ada");
  });
});
