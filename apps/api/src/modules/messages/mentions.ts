const MENTION_PATTERN = /@([A-Za-z0-9_.-]+)/g;
const CHANNEL_PATTERN = /#([a-z0-9-]+)/g;

const EVERYONE_TOKENS = new Set(["everyone", "here"]);

export interface MentionCandidates {
  names: string[];
  channels: string[];
  everyone: boolean;
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
  let everyone = false;

  for (const match of content.matchAll(MENTION_PATTERN)) {
    const token = (match[1] ?? "").toLowerCase();

    if (EVERYONE_TOKENS.has(token)) {
      everyone = true;
    } else {
      names.push(token);
    }
  }

  return {
    names: unique(names),
    channels: unique(
      [...content.matchAll(CHANNEL_PATTERN)].map((match) => match[1] ?? ""),
    ),
    everyone,
  };
}

export function applyMentions(
  content: string,
  resolution: MentionResolution,
): string {
  return content
    .replaceAll(MENTION_PATTERN, (literal, raw: string) => {
      const token = raw.toLowerCase();

      if (EVERYONE_TOKENS.has(token)) {
        return literal;
      }

      const userId = resolution.users.get(token);

      if (userId !== undefined) {
        return `<@${userId}>`;
      }

      const roleId = resolution.roles.get(token);

      return roleId === undefined ? literal : `<@&${roleId}>`;
    })
    .replaceAll(CHANNEL_PATTERN, (literal, raw: string) => {
      const channelId = resolution.channels.get(raw);

      return channelId === undefined ? literal : `<#${channelId}>`;
    });
}

export function mentionsEveryone(content: string): boolean {
  return findMentionCandidates(content).everyone;
}
