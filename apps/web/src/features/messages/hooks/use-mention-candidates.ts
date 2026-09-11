import { Permissions } from "@opencord/shared/permissions";
import { useQuery } from "@tanstack/react-query";

import {
  channelQuery,
  serverChannelsQuery,
} from "@/features/channels/api/queries";
import { dmParticipantsQuery } from "@/features/dms/api/queries";
import {
  displayName,
  mentionMembersQuery,
} from "@/features/members/api/queries";
import {
  BROADCAST_TOKENS,
  broadcastCandidate,
  channelCandidate,
  isMentionableRole,
  type MentionCandidate,
  type MentionQuery,
  rankMentions,
  roleCandidate,
  userCandidate,
} from "@/features/messages/lib/mentions";
import {
  has,
  useChannelPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { serverRolesQuery } from "@/features/roles/api/queries";
import { currentUserQuery } from "@/features/users/api/queries";

export function useMentionCandidates(
  channelId: string,
  query: MentionQuery | null,
): MentionCandidate[] {
  const { data: me } = useQuery(currentUserQuery);
  const { data: channel } = useQuery(channelQuery(channelId));
  const permissions = useChannelPermissions(channelId);

  const serverId = channel?.serverId ?? null;
  const term = query?.term ?? null;
  const people = query?.trigger === "@";
  const places = query?.trigger === "#";

  const members = useQuery({
    ...mentionMembersQuery(serverId ?? "", term ?? ""),
    enabled: people && serverId !== null,
  });

  const participants = useQuery({
    ...dmParticipantsQuery(channelId),
    enabled: people && channel !== undefined && serverId === null,
  });

  const roles = useQuery({
    ...serverRolesQuery(serverId ?? ""),
    enabled: people && serverId !== null,
  });

  const channels = useQuery({
    ...serverChannelsQuery(serverId ?? ""),
    enabled: places && serverId !== null,
  });

  if (query === null || term === null) {
    return [];
  }

  if (places) {
    return serverId === null
      ? []
      : rankMentions((channels.data ?? []).map(channelCandidate), term);
  }

  const pool =
    serverId === null
      ? (participants.data ?? [])
      : (members.data?.data ?? []).map((entry) => ({
          ...entry.user,
          name: displayName(entry),
        }));

  const mayBroadcast =
    serverId !== null && has(permissions, Permissions.MENTION_EVERYONE);

  return rankMentions(
    [
      ...(mayBroadcast ? BROADCAST_TOKENS.map(broadcastCandidate) : []),
      ...(roles.data ?? []).filter(isMentionableRole).map(roleCandidate),
      ...pool
        .filter((user) => user.id !== me?.id)
        .map((user) => userCandidate(user)),
    ],
    term,
  );
}
