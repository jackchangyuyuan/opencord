import { queryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
}

export const currentUserQuery = queryOptions({
  queryKey: ["users", "@me"],
  queryFn: ({ signal }) => api<CurrentUser>("/users/@me", { signal }),
});

export function userQuery(userId: string) {
  return queryOptions({
    queryKey: ["users", userId] as const,
    queryFn: ({ signal }) => api<CurrentUser>(`/users/${userId}`, { signal }),
    staleTime: 5 * 60_000,
  });
}
