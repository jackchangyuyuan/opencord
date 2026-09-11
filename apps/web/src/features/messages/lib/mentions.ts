import {
  BROADCAST_TOKENS,
  type BroadcastToken,
  RESOLVABLE_MENTION_NAME,
  USERNAME_MAX_LENGTH,
} from "@opencord/shared/constants";
import type { PublicUser } from "@opencord/shared/types";

import type { ChannelSummary } from "@/features/channels/api/queries";
import type { PublicRole } from "@/features/roles/api/queries";

export const MENTION_TRIGGERS = ["@", "#"] as const;

export type MentionTrigger = (typeof MENTION_TRIGGERS)[number];

export interface MentionQuery {
  trigger: MentionTrigger;
  start: number;
  end: number;
  term: string;
}

const TERM = /^[\p{L}\p{N}_.-]*$/u;

function isTrigger(value: string | undefined): value is MentionTrigger {
  return value === "@" || value === "#";
}

export function activeMention(
  value: string,
  caret: number,
): MentionQuery | null {
  const before = value.slice(0, caret);
  const start = Math.max(before.lastIndexOf("@"), before.lastIndexOf("#"));

  if (start === -1) {
    return null;
  }

  const trigger = before[start];

  if (!isTrigger(trigger)) {
    return null;
  }

  const preceding = start === 0 ? " " : (before[start - 1] ?? " ");

  if (!/\s/.test(preceding)) {
    return null;
  }

  const term = before.slice(start + 1);

  if (term.length > USERNAME_MAX_LENGTH || !TERM.test(term)) {
    return null;
  }

  return { trigger, start, end: caret, term };
}

export { BROADCAST_TOKENS, type BroadcastToken };

export type MentionCandidate =
  | { kind: "broadcast"; key: string; token: BroadcastToken }
  | { kind: "role"; key: string; role: PublicRole }
  | { kind: "user"; key: string; user: PublicUser }
  | { kind: "channel"; key: string; channel: ChannelSummary };

export function broadcastCandidate(token: BroadcastToken): MentionCandidate {
  return { kind: "broadcast", key: `broadcast-${token}`, token };
}

export function roleCandidate(role: PublicRole): MentionCandidate {
  return { kind: "role", key: `role-${role.id}`, role };
}

export function userCandidate(user: PublicUser): MentionCandidate {
  return { kind: "user", key: `user-${user.id}`, user };
}

export function channelCandidate(channel: ChannelSummary): MentionCandidate {
  return { kind: "channel", key: `channel-${channel.id}`, channel };
}

export function isMentionableRole(role: PublicRole): boolean {
  return !role.isDefault && RESOLVABLE_MENTION_NAME.test(role.name);
}

export function mentionText(candidate: MentionCandidate): string {
  switch (candidate.kind) {
    case "broadcast":
      return `@${candidate.token}`;
    case "role":
      return `@${candidate.role.name}`;
    case "channel":
      return `#${candidate.channel.name ?? ""}`;
    default:
      return `@${candidate.user.username}`;
  }
}

export interface MentionInsertion {
  value: string;
  caret: number;
}

export function applyMention(
  value: string,
  query: MentionQuery,
  token: string,
): MentionInsertion {
  const before = value.slice(0, query.start);
  const after = value.slice(query.end);
  const trailing = /^\s/.test(after) ? "" : " ";
  const mention = `${token}${trailing}`;

  return {
    value: `${before}${mention}${after}`,
    caret: before.length + mention.length,
  };
}

function scoreText(text: string, term: string): number {
  const value = text.toLowerCase();

  if (value === term) {
    return 6;
  }

  if (value.startsWith(term)) {
    return 5;
  }

  if (value.split(/[\s-]+/).some((word) => word.startsWith(term))) {
    return 3;
  }

  return value.includes(term) ? 2 : 0;
}

function scoreUser(user: PublicUser, term: string): number {
  const username = user.username.toLowerCase();
  const name = user.name.toLowerCase();

  if (username === term) {
    return 6;
  }

  if (username.startsWith(term)) {
    return 5;
  }

  if (name.startsWith(term)) {
    return 4;
  }

  if (name.split(/\s+/).some((word) => word.startsWith(term))) {
    return 3;
  }

  if (username.includes(term)) {
    return 2;
  }

  return name.includes(term) ? 1 : 0;
}

function score(candidate: MentionCandidate, term: string): number {
  if (term === "") {
    return 1;
  }

  switch (candidate.kind) {
    case "broadcast":
      return scoreText(candidate.token, term);
    case "role":
      return scoreText(candidate.role.name, term);
    case "channel":
      return scoreText(candidate.channel.name ?? "", term);
    default:
      return scoreUser(candidate.user, term);
  }
}

const KIND_ORDER: Record<MentionCandidate["kind"], number> = {
  broadcast: 0,
  role: 1,
  user: 2,
  channel: 3,
};

function sortKey(candidate: MentionCandidate): string {
  switch (candidate.kind) {
    case "broadcast":
      return candidate.token;
    case "role":
      return `${candidate.role.name} ${candidate.role.id}`;
    case "channel":
      return `${candidate.channel.name ?? ""} ${candidate.channel.id}`;
    default:
      return candidate.user.username;
  }
}

export const MENTION_SUGGESTION_LIMIT = 6;

export function mentionOptionId(listId: string, key: string): string {
  return `${listId}-${key}`;
}

export function rankMentions(
  pool: readonly MentionCandidate[],
  term: string,
  limit = MENTION_SUGGESTION_LIMIT,
): MentionCandidate[] {
  const needle = term.toLowerCase();

  if (needle === "") {
    return pool.slice(0, limit);
  }

  return pool
    .map((candidate) => ({ candidate, weight: score(candidate, needle) }))
    .filter((entry) => entry.weight > 0)
    .sort(
      (left, right) =>
        right.weight - left.weight ||
        KIND_ORDER[left.candidate.kind] - KIND_ORDER[right.candidate.kind] ||
        sortKey(left.candidate).localeCompare(sortKey(right.candidate)),
    )
    .slice(0, limit)
    .map((entry) => entry.candidate);
}
