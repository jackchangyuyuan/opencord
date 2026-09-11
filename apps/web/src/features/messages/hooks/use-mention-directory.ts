import type { PublicUser } from "@opencord/shared/types";
import {
  type QueryClient,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";

import {
  channelQuery,
  type ChannelSummary,
  serverChannelsQuery,
} from "@/features/channels/api/queries";
import {
  type MentionDirectory,
  type MentionTargets,
  mentionTargets,
} from "@/features/messages/lib/mention-syntax";
import {
  type PublicRole,
  serverRolesQuery,
} from "@/features/roles/api/queries";
import { userQuery, userQueryKey } from "@/features/users/api/queries";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asUser(value: unknown): PublicUser | null {
  return isRecord(value) &&
    typeof value["id"] === "string" &&
    typeof value["username"] === "string" &&
    typeof value["name"] === "string"
    ? (value as unknown as PublicUser)
    : null;
}

function collect(value: unknown, into: Map<string, PublicUser>): void {
  const user = asUser(value);

  if (user !== null) {
    into.set(user.id, user);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collect(entry, into);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  collect(value["pages"], into);
  collect(value["data"], into);
  collect(value["user"], into);
}

function holdsUsers(queryKey: readonly unknown[]): boolean {
  if (queryKey[0] === "users") {
    return true;
  }

  return (
    (queryKey[0] === "servers" || queryKey[0] === "channels") &&
    queryKey[2] === "members"
  );
}

function knownUsers(queryClient: QueryClient): Map<string, PublicUser> {
  const users = new Map<string, PublicUser>();

  for (const query of queryClient.getQueryCache().getAll()) {
    if (holdsUsers(query.queryKey)) {
      collect(query.state.data, users);
    }
  }

  return users;
}

function readDirectory(
  queryClient: QueryClient,
  channelId: string,
): MentionDirectory {
  const channel = queryClient.getQueryData<ChannelSummary>(
    channelQuery(channelId).queryKey,
  );
  const serverId = channel?.serverId ?? null;

  const roles =
    serverId === null
      ? []
      : (queryClient.getQueryData<PublicRole[]>(
          serverRolesQuery(serverId).queryKey,
        ) ?? []);

  const channels =
    serverId === null
      ? []
      : (queryClient.getQueryData<ChannelSummary[]>(
          serverChannelsQuery(serverId).queryKey,
        ) ?? []);

  return {
    users: knownUsers(queryClient),
    roles: new Map(roles.map((role) => [role.id, role])),
    channels: new Map(channels.map((entry) => [entry.id, entry])),
  };
}

export interface MentionDirectoryAccess {
  read: () => MentionDirectory;
  seed: (resolved: {
    users: readonly PublicUser[];
    channels: readonly ChannelSummary[];
  }) => void;
}

export function useMentionDirectory(channelId: string): MentionDirectoryAccess {
  const queryClient = useQueryClient();

  const read = useCallback(
    () => readDirectory(queryClient, channelId),
    [channelId, queryClient],
  );

  const seed = useCallback(
    (resolved: {
      users: readonly PublicUser[];
      channels: readonly ChannelSummary[];
    }) => {
      for (const user of resolved.users) {
        queryClient.setQueryData<PublicUser>(
          userQueryKey(user.id),
          (held) => held ?? user,
        );
      }

      for (const channel of resolved.channels) {
        queryClient.setQueryData<ChannelSummary>(
          channelQuery(channel.id).queryKey,
          (held) => held ?? channel,
        );
      }
    },
    [queryClient],
  );

  return { read, seed };
}

export interface StoredMentionDirectory {
  directory: MentionDirectory;
  pending: boolean;
}

export function useStoredMentions(
  channelId: string,
  content: string,
): StoredMentionDirectory {
  const targets: MentionTargets = mentionTargets(content);

  const { data: channel } = useQuery({
    ...channelQuery(channelId),
    enabled: channelId !== "",
  });
  const serverId = channel?.serverId ?? null;

  const { data: roles } = useQuery({
    ...serverRolesQuery(serverId ?? ""),
    enabled: serverId !== null && targets.roleIds.length > 0,
  });

  const users = useQueries({
    queries: targets.userIds.map((id) => userQuery(id)),
  });

  const channels = useQueries({
    queries: targets.channelIds.map((id) => channelQuery(id)),
  });

  return {
    directory: {
      users: new Map(
        users
          .map((result) => result.data)
          .filter((user): user is PublicUser => user !== undefined)
          .map((user) => [user.id, user]),
      ),
      roles: new Map((roles ?? []).map((role) => [role.id, role])),
      channels: new Map(
        channels
          .map((result) => result.data)
          .filter((entry): entry is ChannelSummary => entry !== undefined)
          .map((entry) => [entry.id, entry]),
      ),
    },
    pending:
      users.some((result) => result.isPending) ||
      channels.some((result) => result.isPending) ||
      (serverId !== null && targets.roleIds.length > 0 && roles === undefined),
  };
}
