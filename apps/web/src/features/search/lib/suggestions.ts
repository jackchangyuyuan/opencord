import type { ChannelListEntry } from "@/features/channels/api/queries";
import type { ServerMemberEntry } from "@/features/members/api/queries";
import {
  alreadyFiltered,
  FILTER_KEYS,
  type FilterKey,
  hasFilterKey,
  type QueryToken,
} from "@/features/search/lib/query-token";

export const SUGGESTION_LIMIT = 8;

export function suggestionOptionId(listId: string, key: string): string {
  return `${listId}-${key.replace(/[^a-z0-9-]/gi, "")}`;
}

export type Suggestion =
  | {
      kind: "filter";
      key: FilterKey;
      id: string;
      title: string;
      hint: null;
      insert: string;
      continues: true;
    }
  | {
      kind: "user";
      id: string;
      title: string;
      hint: string;
      insert: string;
      avatarUrl: string | null;
      userId: string;
      continues: false;
    }
  | {
      kind: "channel";
      id: string;
      title: string;
      hint: string | null;
      insert: string;
      channelId: string;
      channelName: string;
      continues: false;
    };

export const FILTER_TITLE: Record<FilterKey, string> = {
  from: "From user",
  in: "In channel",
  on: "On date",
  before: "Before date",
  after: "After date",
};

function matches(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function filterSuggestions(token: QueryToken, raw: string): Suggestion[] {
  const typed = token.text.toLowerCase();

  return FILTER_KEYS.filter(
    (key) =>
      typed === "" ||
      key.startsWith(typed.replace(/:$/, "")) ||
      matches(FILTER_TITLE[key], typed),
  )
    .filter((key) => key === "from" || key === "in" || !hasFilterKey(raw, key))
    .map((key) => ({
      kind: "filter" as const,
      key,
      id: `filter:${key}`,
      title: FILTER_TITLE[key],
      hint: null,
      insert: `${key}:`,
      continues: true as const,
    }));
}

function userSuggestions(
  members: readonly ServerMemberEntry[],
  token: QueryToken,
  raw: string,
): Suggestion[] {
  return members
    .filter(
      (member) =>
        token.value === "" ||
        matches(member.user.username, token.value) ||
        matches(member.user.name, token.value) ||
        matches(member.nickname ?? "", token.value),
    )
    .filter((member) => !alreadyFiltered(raw, "from", member.user.username))
    .slice(0, SUGGESTION_LIMIT)
    .map((member) => ({
      kind: "user" as const,
      id: `user:${member.user.id}`,
      title: member.nickname ?? member.user.name,
      hint: `@${member.user.username}`,
      insert: `from:@${member.user.username}`,
      avatarUrl: member.user.avatarUrl,
      userId: member.user.id,
      continues: false as const,
    }));
}

function channelSuggestions(
  channels: readonly ChannelListEntry[],
  token: QueryToken,
  raw: string,
): Suggestion[] {
  const seen = new Map<string, number>();

  for (const channel of channels) {
    const name = (channel.name ?? "").toLowerCase();

    seen.set(name, (seen.get(name) ?? 0) + 1);
  }

  return channels
    .filter(
      (channel) =>
        token.value === "" || matches(channel.name ?? "", token.value),
    )
    .filter((channel) => !alreadyFiltered(raw, "in", channel.name ?? ""))
    .slice(0, SUGGESTION_LIMIT)
    .map((channel) => ({
      kind: "channel" as const,
      id: `channel:${channel.id}`,
      title: `#${channel.name ?? "channel"}`,
      hint:
        (seen.get((channel.name ?? "").toLowerCase()) ?? 0) > 1
          ? (channel.topic ?? null)
          : null,
      insert: `in:#${channel.name ?? ""}`,
      channelId: channel.id,
      channelName: channel.name ?? "",
      continues: false as const,
    }));
}

export interface SuggestionSources {
  channels: readonly ChannelListEntry[];
  members: readonly ServerMemberEntry[];
}

export function suggestionsFor(
  raw: string,
  token: QueryToken,
  sources: SuggestionSources,
): Suggestion[] {
  if (token.key === "from") {
    return userSuggestions(sources.members, token, raw);
  }

  if (token.key === "in") {
    return channelSuggestions(sources.channels, token, raw);
  }

  if (token.key !== null) {
    return [];
  }

  return filterSuggestions(token, raw).slice(0, SUGGESTION_LIMIT);
}
