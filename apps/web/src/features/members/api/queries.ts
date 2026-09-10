import type { PublicUser } from "@opencord/shared/types";
import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
} from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export type { PublicUser };

const MENTION_FETCH_LIMIT = 25;

export interface ServerMemberEntry {
  user: PublicUser;
  nickname: string | null;
  joinedAt: string;
  roleIds: string[];
}

export interface MemberPage {
  data: ServerMemberEntry[];
  nextCursor: string | null;
}

export function serverMembersQueryKey(serverId: string) {
  return ["servers", serverId, "members"] as const;
}

export function isMemberList(queryKey: readonly unknown[]): boolean {
  return (
    queryKey.length >= 3 &&
    queryKey[2] === "members" &&
    (queryKey[0] === "servers" || queryKey[0] === "channels")
  );
}

export function mentionMembersQueryKey(serverId: string, term: string) {
  return ["servers", serverId, "members", "mention", term] as const;
}

export function mentionMembersQuery(serverId: string, term: string) {
  return queryOptions({
    queryKey: mentionMembersQueryKey(serverId, term),
    queryFn: ({ signal }) =>
      api<MemberPage>(
        `/servers/${serverId}/members?limit=${String(MENTION_FETCH_LIMIT)}${
          term === "" ? "" : `&q=${encodeURIComponent(term)}`
        }`,
        { signal },
      ),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function serverMembersQuery(serverId: string, term = "") {
  const search = term.trim();

  return infiniteQueryOptions({
    queryKey: [...serverMembersQueryKey(serverId), search] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams();

      if (search !== "") {
        params.set("q", search);
      }

      if (pageParam !== null) {
        params.set("cursor", pageParam);
      }

      const query = params.toString();

      return api<MemberPage>(
        `/servers/${serverId}/members${query === "" ? "" : `?${query}`}`,
        { signal },
      );
    },
    getNextPageParam: (page) => page.nextCursor,
    placeholderData: keepPreviousData,
  });
}

export function serverMemberQueryKey(serverId: string, userId: string) {
  return ["servers", serverId, "member", userId] as const;
}

export function serverMemberQuery(serverId: string, userId: string) {
  return queryOptions({
    queryKey: serverMemberQueryKey(serverId, userId),
    queryFn: ({ signal }) =>
      api<ServerMemberEntry>(
        `/servers/${serverId}/members/${encodeURIComponent(userId)}`,
        { signal },
      ),
    staleTime: 30_000,
    retry: false,
  });
}

export function displayName(member: ServerMemberEntry): string {
  return member.nickname ?? member.user.name;
}

export interface BanEntry {
  user: PublicUser;
  reason: string | null;
  bannedBy: string;
  createdAt: string;
}

export function serverBansQueryKey(serverId: string) {
  return ["servers", serverId, "bans"] as const;
}

export function serverBansQuery(serverId: string) {
  return queryOptions({
    queryKey: serverBansQueryKey(serverId),
    queryFn: ({ signal }) =>
      api<BanEntry[]>(`/servers/${serverId}/bans`, { signal }),
  });
}
