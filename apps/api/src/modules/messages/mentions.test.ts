import { describe, expect, it } from "vitest";

import {
  applyMentions,
  findMentionCandidates,
  type MentionResolution,
} from "./mentions.js";

const resolution: MentionResolution = {
  users: new Map([["ada", "user-ada"]]),
  roles: new Map([["staff", "role-staff"]]),
  channels: new Map([["general", "channel-general"]]),
};

describe("findMentionCandidates", () => {
  it("collects names and channels, with no broadcast in sight", () => {
    expect(findMentionCandidates("hi @Ada and @staff in #general")).toEqual({
      names: ["ada", "staff"],
      channels: ["general"],
      broadcast: null,
    });
  });

  it("keeps @everyone and @here apart as broadcast tokens", () => {
    expect(findMentionCandidates("@everyone listen")).toEqual({
      names: [],
      channels: [],
      broadcast: "everyone",
    });
    expect(findMentionCandidates("@here too")).toMatchObject({
      broadcast: "here",
    });
  });

  it("lets @everyone outrank @here when a message carries both", () => {
    expect(findMentionCandidates("@here and @everyone")).toMatchObject({
      broadcast: "everyone",
    });
    expect(findMentionCandidates("@everyone and @here")).toMatchObject({
      broadcast: "everyone",
    });
  });

  it("deduplicates repeated mentions", () => {
    expect(findMentionCandidates("@ada @ada @Ada")).toMatchObject({
      names: ["ada"],
    });
  });

  it("finds nothing in plain text", () => {
    expect(findMentionCandidates("no mentions here")).toEqual({
      names: [],
      channels: [],
      broadcast: null,
    });
  });

  it("ignores an email-looking address's domain as a channel", () => {
    expect(findMentionCandidates("mail ada@example.com")).toMatchObject({
      names: ["example.com"],
      channels: [],
    });
  });
});

describe("applyMentions", () => {
  it("rewrites resolved users, roles and channels", () => {
    expect(applyMentions("hi @ada and @staff in #general", resolution)).toBe(
      "hi <@user-ada> and <@&role-staff> in <#channel-general>",
    );
  });

  it("leaves unresolvable markers as literal text", () => {
    expect(applyMentions("hi @nobody in #nowhere", resolution)).toBe(
      "hi @nobody in #nowhere",
    );
  });

  it("leaves @everyone and @here alone", () => {
    expect(applyMentions("@everyone and @here", resolution)).toBe(
      "@everyone and @here",
    );
  });

  it("prefers a user over a role of the same name", () => {
    expect(
      applyMentions("@ada", {
        users: new Map([["ada", "user-ada"]]),
        roles: new Map([["ada", "role-ada"]]),
        channels: new Map(),
      }),
    ).toBe("<@user-ada>");
  });

  it("is case-insensitive on names and preserves the rest of the text", () => {
    expect(applyMentions("Hello, @ADA!", resolution)).toBe(
      "Hello, <@user-ada>!",
    );
  });
});

describe("the broadcast token", () => {
  it("names the token, and only for a real one", () => {
    expect(findMentionCandidates("@everyone").broadcast).toBe("everyone");
    expect(findMentionCandidates("@here").broadcast).toBe("here");
    expect(findMentionCandidates("@ada").broadcast).toBeNull();
    expect(findMentionCandidates("everyone").broadcast).toBeNull();
    expect(findMentionCandidates("@everyones").broadcast).toBeNull();
  });
});
