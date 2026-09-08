import { describe, expect, it } from "vitest";

import { USERNAME_MAX_LENGTH } from "./limits.js";
import {
  BROADCAST_TOKENS,
  CHANNEL_MENTION_PATTERN,
  isBroadcastToken,
  MENTION_MARKER_PATTERN,
  MENTION_PATTERN,
  RESOLVABLE_MENTION_NAME,
  STORED_MENTION_PATTERN,
} from "./mentions.js";

function tokens(content: string, pattern: RegExp): string[] {
  return [...content.matchAll(pattern)].map((match) => match[1] ?? "");
}

describe("the mention alphabet", () => {
  it("reads a handle up to the characters a handle may contain", () => {
    expect(tokens("hi @ada_love.lace-1 there", MENTION_PATTERN)).toEqual([
      "ada_love.lace-1",
    ]);
  });

  it("stops at whitespace and at punctuation a handle cannot hold", () => {
    expect(tokens("@ada, and @grace!", MENTION_PATTERN)).toEqual([
      "ada",
      "grace",
    ]);
  });

  it("accepts every character a username may be made of", () => {
    const username = "a".padEnd(USERNAME_MAX_LENGTH, "z");

    expect(tokens(`@${username}`, MENTION_PATTERN)).toEqual([username]);
  });

  it("reads a channel as the lowercase name it is stored as", () => {
    expect(tokens("see #general-chat now", CHANNEL_MENTION_PATTERN)).toEqual([
      "general-chat",
    ]);
  });

  it("does not read an uppercase channel name, which cannot be stored", () => {
    expect(tokens("#General", CHANNEL_MENTION_PATTERN)).toEqual([]);
  });
});

describe("the resolvable-name test", () => {
  it("accepts exactly what MENTION_PATTERN would read back", () => {
    expect(RESOLVABLE_MENTION_NAME.test("Moderator")).toBe(true);
    expect(RESOLVABLE_MENTION_NAME.test("core-team_1.0")).toBe(true);
  });

  it("rejects a name a draft could not round-trip", () => {
    expect(RESOLVABLE_MENTION_NAME.test("New role")).toBe(false);
    expect(RESOLVABLE_MENTION_NAME.test("@everyone")).toBe(false);
  });
});

describe("the stored markers", () => {
  it("reads the three shapes the API writes", () => {
    const found = [
      ..."<@u1> <@&r1> <#c1>".matchAll(STORED_MENTION_PATTERN),
    ].map((match) => [match[1], match[2]]);

    expect(found).toEqual([
      ["@", "u1"],
      ["@&", "r1"],
      ["#", "c1"],
    ]);
  });

  it("does not span whitespace or nest", () => {
    expect([..."<@ u1>".matchAll(STORED_MENTION_PATTERN)]).toEqual([]);
  });
});

describe("the broadcast tokens", () => {
  it("is the pair the permission bit gates", () => {
    expect(BROADCAST_TOKENS).toEqual(["everyone", "here"]);
  });

  it("recognises each one and nothing else", () => {
    expect(isBroadcastToken("everyone")).toBe(true);
    expect(isBroadcastToken("here")).toBe(true);
    expect(isBroadcastToken("everybody")).toBe(false);
  });

  it("is left literal by the stored-marker pattern", () => {
    expect([..."@everyone".matchAll(STORED_MENTION_PATTERN)]).toEqual([]);
  });
});

describe("the combined marker", () => {
  it("reads stored markers and literal broadcasts in one pass", () => {
    const kinds = [
      ..."<@u1> <@&r1> <#c1> @everyone @here".matchAll(MENTION_MARKER_PATTERN),
    ].map((match) => match[1] ?? match[3]);

    expect(kinds).toEqual(["@", "@&", "#", "everyone", "here"]);
  });

  it("reads a broadcast exactly as far as the mention alphabet does", () => {
    expect([..."@everyones".matchAll(MENTION_MARKER_PATTERN)]).toEqual([]);
    expect([..."@everyone.com".matchAll(MENTION_MARKER_PATTERN)]).toEqual([]);
  });
});
