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
