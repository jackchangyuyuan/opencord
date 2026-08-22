import { describe, expect, it } from "vitest";

import {
  applyMentions,
  findMentionCandidates,
  type MentionResolution,
  mentionsEveryone,
} from "./mentions.js";

const resolution: MentionResolution = {
  users: new Map([["ada", "user-ada"]]),
  roles: new Map([["staff", "role-staff"]]),
  channels: new Map([["general", "channel-general"]]),
};

describe("findMentionCandidates", () => {
  it("collects names, channels and the everyone flag", () => {
    expect(findMentionCandidates("hi @Ada and @staff in #general")).toEqual({
      names: ["ada", "staff"],
      channels: ["general"],
      everyone: false,
    });
  });

  it("treats @everyone and @here as the broadcast token, not a name", () => {
    expect(findMentionCandidates("@everyone listen")).toEqual({
      names: [],
      channels: [],
      everyone: true,
    });
    expect(findMentionCandidates("@here too")).toMatchObject({
      everyone: true,
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
      everyone: false,
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

describe("mentionsEveryone", () => {
  it("is true only for the broadcast tokens", () => {
    expect(mentionsEveryone("@everyone")).toBe(true);
    expect(mentionsEveryone("@here")).toBe(true);
    expect(mentionsEveryone("@ada")).toBe(false);
    expect(mentionsEveryone("everyone")).toBe(false);
  });
});
