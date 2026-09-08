import {
  type BroadcastToken,
  CHANNEL_MENTION_PATTERN,
  isBroadcastToken,
  MENTION_PATTERN,
} from "@opencord/shared/constants";

export type { BroadcastToken };

export interface MentionCandidates {
  names: string[];
  channels: string[];
  broadcast: BroadcastToken | null;
}

export interface MentionResolution {
  users: ReadonlyMap<string, string>;
  roles: ReadonlyMap<string, string>;
  channels: ReadonlyMap<string, string>;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function findMentionCandidates(content: string): MentionCandidates {
  const names: string[] = [];
  let broadcast: BroadcastToken | null = null;

  for (const match of content.matchAll(MENTION_PATTERN)) {
    const token = (match[1] ?? "").toLowerCase();

    if (isBroadcastToken(token)) {
      broadcast = broadcast === "everyone" ? broadcast : token;
    } else {
      names.push(token);
    }
  }

  return {
    names: unique(names),
    channels: unique(
      [...content.matchAll(CHANNEL_MENTION_PATTERN)].map(
        (match) => match[1] ?? "",
      ),
    ),
    broadcast,
  };
}

export function applyMentions(
  content: string,
  resolution: MentionResolution,
): string {
  return content
    .replaceAll(MENTION_PATTERN, (literal, raw: string) => {
      const token = raw.toLowerCase();

      if (isBroadcastToken(token)) {
        return literal;
      }

      const userId = resolution.users.get(token);

      if (userId !== undefined) {
        return `<@${userId}>`;
      }

      const roleId = resolution.roles.get(token);

      return roleId === undefined ? literal : `<@&${roleId}>`;
    })
    .replaceAll(CHANNEL_MENTION_PATTERN, (literal, raw: string) => {
      const channelId = resolution.channels.get(raw);

      return channelId === undefined ? literal : `<#${channelId}>`;
    });
}
