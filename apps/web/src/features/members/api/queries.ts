import { infiniteQueryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export interface PublicUser {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
}

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

export function serverMembersQuery(serverId: string) {
  return infiniteQueryOptions({
    queryKey: serverMembersQueryKey(serverId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api<MemberPage>(
        `/servers/${serverId}/members${
          pageParam === null ? "" : `?cursor=${encodeURIComponent(pageParam)}`
        }`,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function displayName(member: ServerMemberEntry): string {
  return member.nickname ?? member.user.name;
}
