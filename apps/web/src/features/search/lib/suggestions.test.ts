import { describe, expect, it } from "vitest";

import type { ChannelListEntry } from "@/features/channels/api/queries";
import type { ServerMemberEntry } from "@/features/members/api/queries";

import { tokenAt } from "./query-token";
import { suggestionsFor } from "./suggestions";

function channel(id: string, name: string): ChannelListEntry {
  return {
    id,
    serverId: "s-1",
    type: "text",
    name,
    topic: null,
    position: 0,
    lastMessageId: null,
    lastEveryoneMentionId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastReadMessageId: null,
    hasUnread: false,
    hasEveryone: false,
    mentionCount: 0,
    unreadCount: 0,
  };
}

function member(id: string, username: string, name: string): ServerMemberEntry {
  return {
    user: {
      id,
      username,
      name,
      avatarUrl: null,
      description: null,
      customStatus: null,
      customStatusEmoji: null,
      isGuest: false,
    },
    nickname: null,
    joinedAt: "2026-01-01T00:00:00.000Z",
    roleIds: [],
  };
}

const SOURCES = {
  channels: [channel("c-general", "general"), channel("c-eng", "engineering")],
  members: [
    member("u-ada", "adalovelace", "Ada Lovelace"),
    member("u-grace", "ghopper", "Grace Hopper"),
  ],
};

function suggest(raw: string, caret = raw.length) {
  return suggestionsFor(raw, tokenAt(raw, caret), SOURCES);
}

describe("suggestionsFor — the filters themselves", () => {
  it("offers every filter to somebody who has typed nothing", () => {
    expect(suggest("").map((s) => s.title)).toEqual([
      "From user",
      "In channel",
      "On date",
      "Before date",
      "After date",
    ]);
  });

  it("narrows on the key somebody is typing", () => {
    expect(suggest("be").map((s) => s.title)).toEqual(["Before date"]);
  });

  it("narrows on the words somebody would say instead", () => {
    expect(suggest("date").map((s) => s.title)).toEqual([
      "On date",
      "Before date",
      "After date",
    ]);
  });

  it("marks a filter as unfinished", () => {
    expect(suggest("from").map((s) => s.continues)).toEqual([true]);
    expect(suggest("from")[0]?.insert).toBe("from:");
  });

  it("stops offering a date filter that is already in the query", () => {
    expect(suggest("on:2026-03-14 ").map((s) => s.title)).not.toContain(
      "On date",
    );
  });
});

describe("suggestionsFor — people", () => {
  it("completes on the handle and on the display name", () => {
    expect(suggest("from:ada").map((s) => s.id)).toEqual(["user:u-ada"]);
    expect(suggest("from:hopper").map((s) => s.id)).toEqual(["user:u-grace"]);
  });

  it("always inserts the handle", () => {
    expect(suggest("from:Grace")[0]?.insert).toBe("from:@ghopper");
  });

  it("offers everybody before anything is typed", () => {
    expect(suggest("from:")).toHaveLength(2);
  });

  it("does not offer somebody who is already filtered for", () => {
    expect(suggest("from:@adalovelace from:ada")).toEqual([]);
  });
});

describe("suggestionsFor — channels", () => {
  it("inserts the readable name and carries the id alongside it", () => {
    const picked = suggest("in:eng")[0];

    expect(picked?.insert).toBe("in:#engineering");
    expect(picked?.title).toBe("#engineering");
    expect(picked?.kind === "channel" ? picked.channelId : null).toBe("c-eng");
  });

  it("never puts an id in the query text", () => {
    for (const suggestion of suggest("in:")) {
      expect(suggestion.insert).not.toContain("c-");
    }
  });

  it("offers only the channels it was given, which are the visible ones", () => {
    expect(suggest("in:").map((s) => s.title)).toEqual([
      "#general",
      "#engineering",
    ]);
  });

  it("matches nothing for a channel that is not in the list", () => {
    expect(suggest("in:secret")).toEqual([]);
  });

  it("does not offer a channel that is already filtered for", () => {
    expect(suggest("in:#engineering in:eng")).toEqual([]);
  });
});

describe("suggestionsFor — dates", () => {
  it("offers no rows once a date filter is open", () => {
    expect(suggest("on:")).toEqual([]);
    expect(suggest("before:2026")).toEqual([]);
  });

  it("offers the three date filters by name and nothing under them", () => {
    expect(suggest("on").map((entry) => entry.title)).toEqual(["On date"]);
    expect(suggest("before")[0]?.title).toBe("Before date");
    expect(suggest("after")[0]?.title).toBe("After date");
    expect(suggest("on")[0]?.hint).toBeNull();
  });

  it("starts the filter rather than finishing it", () => {
    expect(suggest("on")[0]?.insert).toBe("on:");
    expect(suggest("on")[0]?.continues).toBe(true);
  });
});
