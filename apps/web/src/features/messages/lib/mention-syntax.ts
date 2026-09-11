import {
  CHANNEL_MENTION_PATTERN,
  isBroadcastToken,
  MENTION_PATTERN,
  STORED_MENTION_PATTERN,
} from "@opencord/shared/constants";
import type { PublicUser } from "@opencord/shared/types";

import type { ChannelSummary } from "@/features/channels/api/queries";
import type { PublicRole } from "@/features/roles/api/queries";

export const UNKNOWN_USER = "@[unknown user]";
export const UNKNOWN_ROLE = "@[unknown role]";
export const UNKNOWN_CHANNEL = "#[unknown channel]";

export interface MentionDirectory {
  users: ReadonlyMap<string, PublicUser>;
  roles: ReadonlyMap<string, PublicRole>;
  channels: ReadonlyMap<string, ChannelSummary>;
}

export interface MentionTargets {
  userIds: string[];
  roleIds: string[];
  channelIds: string[];
}

export function mentionTargets(content: string): MentionTargets {
  const userIds = new Set<string>();
  const roleIds = new Set<string>();
  const channelIds = new Set<string>();

  for (const match of content.matchAll(STORED_MENTION_PATTERN)) {
    const id = match[2] ?? "";

    if (match[1] === "#") {
      channelIds.add(id);
    } else if (match[1] === "@&") {
      roleIds.add(id);
    } else {
      userIds.add(id);
    }
  }

  return {
    userIds: [...userIds],
    roleIds: [...roleIds],
    channelIds: [...channelIds],
  };
}

export function toEditableMentions(
  content: string,
  directory: MentionDirectory,
): string {
  return content.replaceAll(
    STORED_MENTION_PATTERN,
    (_literal, prefix: string, id: string) => {
      if (prefix === "#") {
        const name = directory.channels.get(id)?.name;

        return name == null ? UNKNOWN_CHANNEL : `#${name}`;
      }

      if (prefix === "@&") {
        const role = directory.roles.get(id);

        return role === undefined ? UNKNOWN_ROLE : `@${role.name}`;
      }

      const user = directory.users.get(id);

      return user === undefined ? UNKNOWN_USER : `@${user.username}`;
    },
  );
}

export interface LocalResolution {
  content: string;
  users: PublicUser[];
  channels: ChannelSummary[];
  roles: PublicRole[];
}

export function toStoredMentions(
  content: string,
  directory: MentionDirectory,
): LocalResolution {
  const usersByName = new Map(
    [...directory.users.values()].map((user) => [
      user.username.toLowerCase(),
      user,
    ]),
  );
  const rolesByName = new Map(
    [...directory.roles.values()].map((role) => [
      role.name.toLowerCase(),
      role,
    ]),
  );
  const channelsByName = new Map(
    [...directory.channels.values()]
      .filter((channel) => channel.name !== null)
      .map((channel) => [channel.name ?? "", channel]),
  );

  const users: PublicUser[] = [];
  const roles: PublicRole[] = [];
  const channels: ChannelSummary[] = [];

  const withMentions = content.replaceAll(
    MENTION_PATTERN,
    (literal, raw: string) => {
      const token = raw.toLowerCase();

      if (isBroadcastToken(token)) {
        return literal;
      }

      const user = usersByName.get(token);

      if (user !== undefined) {
        users.push(user);
        return `<@${user.id}>`;
      }

      const role = rolesByName.get(token);

      if (role === undefined) {
        return literal;
      }

      roles.push(role);

      return `<@&${role.id}>`;
    },
  );

  return {
    content: withMentions.replaceAll(
      CHANNEL_MENTION_PATTERN,
      (literal, raw: string) => {
        const channel = channelsByName.get(raw);

        if (channel === undefined) {
          return literal;
        }

        channels.push(channel);

        return `<#${channel.id}>`;
      },
    ),
    users,
    roles,
    channels,
  };
}
