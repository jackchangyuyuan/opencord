import type { PublicUser } from "@opencord/shared/types";
import { describe, expect, it } from "vitest";

import type { ChannelSummary } from "@/features/channels/api/queries";
import type { PublicRole } from "@/features/roles/api/queries";

import {
  activeMention,
  applyMention,
  broadcastCandidate,
  channelCandidate,
  isMentionableRole,
  type MentionCandidate,
  mentionText,
  rankMentions,
  roleCandidate,
  userCandidate,
} from "./mentions";

function user(username: string, name: string): PublicUser {
  return {
    id: `u-${username}`,
    username,
    name,
    avatarUrl: null,
    description: null,
    customStatus: null,
    customStatusEmoji: null,
    isGuest: false,
  };
}

function role(name: string, overrides: Partial<PublicRole> = {}): PublicRole {
  return {
    id: `r-${name}`,
    name,
    color: null,
    position: 1,
    permissions: 0,
    isDefault: false,
    ...overrides,
  };
}

function channel(name: string): ChannelSummary {
  return {
    id: `c-${name}`,
    serverId: "s-1",
    type: "text",
    name,
    topic: null,
    position: 0,
    lastMessageId: null,
    lastEveryoneMentionId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const PEOPLE = [
  user("jackyuan", "Jack"),
  user("jacqueline", "Jacqueline Ng"),
  user("ada", "Ada Lovelace"),
  user("hopperfan", "Katherine Johnson"),
  user("grace", "Grace Hopper"),
  user("janet", "Jack"),
].map((entry) => userCandidate(entry));

const ROSTER: MentionCandidate[] = [
  broadcastCandidate("everyone"),
  broadcastCandidate("here"),
  roleCandidate(role("Core")),
  roleCandidate(role("Contributor")),
  ...PEOPLE,
];

function handles(candidates: readonly MentionCandidate[]): string[] {
  return candidates.flatMap((candidate) =>
    candidate.kind === "user" ? [candidate.user.username] : [],
  );
}

function titles(candidates: readonly MentionCandidate[]): string[] {
  return candidates.map(mentionText);
}

describe("activeMention", () => {
  it("opens on a bare @", () => {
    expect(activeMention("@", 1)).toEqual({
      trigger: "@",
      start: 0,
      end: 1,
      term: "",
    });
  });

  it("opens on a bare #", () => {
    expect(activeMention("see #", 5)).toEqual({
      trigger: "#",
      start: 4,
      end: 5,
      term: "",
    });
  });

  it("carries the partial term as it is typed", () => {
    expect(activeMention("hello @ja", 9)).toMatchObject({
      trigger: "@",
      start: 6,
      term: "ja",
    });
    expect(activeMention("hello #ge", 9)).toMatchObject({
      trigger: "#",
      start: 6,
      term: "ge",
    });
  });

  it("ignores a sigil inside a word", () => {
    expect(activeMention("mail ada@example.com", 20)).toBeNull();
    expect(activeMention("issue#12", 8)).toBeNull();
  });

  it("closes once the term takes a space", () => {
    expect(activeMention("@ja ck", 6)).toBeNull();
  });

  it("reads the mention the caret is in, not the last one in the draft", () => {
    expect(activeMention("@ada and @gr", 3)).toMatchObject({ term: "ad" });
  });

  it("lets the nearer sigil win", () => {
    expect(activeMention("#general @ad", 12)).toMatchObject({
      trigger: "@",
      term: "ad",
    });
    expect(activeMention("@ada #ge", 8)).toMatchObject({
      trigger: "#",
      term: "ge",
    });
  });

  it("keeps filtering on a non-ASCII term", () => {
    expect(activeMention("@zoë", 4)?.term).toBe("zoë");
  });

  it("gives up past the longest possible username", () => {
    expect(activeMention(`@${"a".repeat(33)}`, 34)).toBeNull();
  });

  it("stays closed when there is no sigil at all", () => {
    expect(activeMention("plain text", 10)).toBeNull();
  });
});

function insert(value: string, caret: number, token: string) {
  const query = activeMention(value, caret);

  if (query === null) {
    throw new Error(`no mention is active in ${JSON.stringify(value)}`);
  }

  return applyMention(value, query, token);
}

describe("applyMention", () => {
  it("replaces only the partial mention", () => {
    expect(insert("hey @ja, look", 7, "@jackyuan")).toEqual({
      value: "hey @jackyuan , look",
      caret: 14,
    });
  });

  it("leaves the caret after the inserted token", () => {
    const result = insert("@ja", 3, "@jackyuan");

    expect(result.value).toBe("@jackyuan ");
    expect(result.caret).toBe(result.value.length);
  });

  it("does not double the space when one already follows", () => {
    expect(insert("@ja rest", 3, "@jackyuan").value).toBe("@jackyuan rest");
  });

  it("swaps the sigil with the accepted one", () => {
    expect(insert("see #gen", 8, "#general").value).toBe("see #general ");
  });
});

describe("mentionText", () => {
  it("inserts the handle for a person, never the display name", () => {
    expect(mentionText(userCandidate(user("caseyh", "Casey Hart")))).toBe(
      "@caseyh",
    );
  });

  it("inserts the bare token for a broadcast and the name for a role", () => {
    expect(mentionText(broadcastCandidate("here"))).toBe("@here");
    expect(mentionText(roleCandidate(role("Core")))).toBe("@Core");
  });

  it("inserts a channel with its own sigil", () => {
    expect(mentionText(channelCandidate(channel("general")))).toBe("#general");
  });
});

describe("isMentionableRole", () => {
  it("skips @everyone, which is a broadcast token rather than a role", () => {
    expect(isMentionableRole(role("@everyone", { isDefault: true }))).toBe(
      false,
    );
  });

  it("skips a name the server could never resolve back", () => {
    expect(isMentionableRole(role("New role"))).toBe(false);
  });

  it("accepts an ordinary one-token name", () => {
    expect(isMentionableRole(role("Core"))).toBe(true);
    expect(isMentionableRole(role("core-team"))).toBe(true);
  });
});

describe("rankMentions", () => {
  it("shows the default priority for a bare sigil", () => {
    expect(titles(rankMentions(ROSTER, ""))).toEqual([
      "@everyone",
      "@here",
      "@Core",
      "@Contributor",
      "@jackyuan",
      "@jacqueline",
    ]);
  });

  it("puts a handle prefix ahead of a display-name prefix", () => {
    expect(handles(rankMentions(PEOPLE, "ja"))).toEqual([
      "jackyuan",
      "jacqueline",
      "janet",
    ]);
  });

  it("puts an exact handle first", () => {
    expect(handles(rankMentions(PEOPLE, "ada"))[0]).toBe("ada");
  });

  it("ranks a handle prefix ahead of a weaker display-name match", () => {
    expect(handles(rankMentions(PEOPLE, "hopper"))).toEqual([
      "hopperfan",
      "grace",
    ]);
  });

  it("ranks a display-name prefix ahead of a handle substring", () => {
    expect(handles(rankMentions(PEOPLE, "katherine"))[0]).toBe("hopperfan");
    expect(handles(rankMentions(PEOPLE, "acqu"))[0]).toBe("jacqueline");
  });

  it("matches a later word of a display name", () => {
    expect(handles(rankMentions(PEOPLE, "lovelace"))[0]).toBe("ada");
  });

  it("keeps duplicate display names apart by handle", () => {
    const jacks = handles(rankMentions(PEOPLE, "jack"));

    expect(jacks).toContain("jackyuan");
    expect(jacks).toContain("janet");
  });

  it("lets a better person beat a role once a term is typed", () => {
    const pool = [roleCandidate(role("Contributor")), ...PEOPLE];

    expect(
      titles(rankMentions([...pool, userCandidate(user("co", "Co"))], "co"))[0],
    ).toBe("@co");
  });

  it("keeps the order total so the list does not reshuffle", () => {
    const once = titles(rankMentions(ROSTER, "c"));
    const twice = titles(rankMentions([...ROSTER].reverse(), "c"));

    expect(once).toEqual(twice);
  });

  it("drops what does not match at all", () => {
    expect(rankMentions(PEOPLE, "zzzz")).toEqual([]);
  });

  it("bounds the menu", () => {
    expect(rankMentions(PEOPLE, "", 2)).toHaveLength(2);
  });
});
