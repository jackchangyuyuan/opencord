import type { PublicUser } from "@opencord/shared/types";
import { queryOptions } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

export type CurrentUser = PublicUser;

export const currentUserQueryKey = ["users", "@me"] as const;

export const currentUserQuery = queryOptions({
  queryKey: currentUserQueryKey,
  queryFn: ({ signal }) => api<CurrentUser>("/users/@me", { signal }),
});

export function userQueryKey(userId: string) {
  return ["users", userId] as const;
}

const BATCH_LIMIT = 100;

interface Waiting {
  resolve: (user: PublicUser) => void;
  reject: (error: unknown) => void;
}

const waiting = new Map<string, Waiting[]>();
let scheduled = false;

function fetchOne(userId: string): Promise<PublicUser> {
  return api<PublicUser>(`/users/${encodeURIComponent(userId)}`);
}

function settleIndividually(
  batch: [string, Waiting[]][],
  found: Map<string, PublicUser>,
): void {
  for (const [id, callers] of batch) {
    const user = found.get(id);

    if (user !== undefined) {
      for (const caller of callers) {
        caller.resolve(user);
      }

      continue;
    }

    void fetchOne(id).then(
      (one) => {
        for (const caller of callers) {
          caller.resolve(one);
        }
      },
      (error: unknown) => {
        for (const caller of callers) {
          caller.reject(error);
        }
      },
    );
  }
}

async function flush(): Promise<void> {
  scheduled = false;

  const batch = [...waiting.entries()].slice(0, BATCH_LIMIT);

  for (const [id] of batch) {
    waiting.delete(id);
  }

  if (waiting.size > 0) {
    schedule();
  }

  if (batch.length === 0) {
    return;
  }

  try {
    const users = await api<PublicUser[]>(
      `/users?ids=${batch.map(([id]) => encodeURIComponent(id)).join(",")}`,
    );

    settleIndividually(batch, new Map(users.map((user) => [user.id, user])));
  } catch (error) {
    for (const [, callers] of batch) {
      for (const caller of callers) {
        caller.reject(error);
      }
    }
  }
}

function schedule(): void {
  if (scheduled) {
    return;
  }

  scheduled = true;
  queueMicrotask(() => void flush());
}

function fetchUser(userId: string): Promise<PublicUser> {
  return new Promise<PublicUser>((resolve, reject) => {
    waiting.set(userId, [...(waiting.get(userId) ?? []), { resolve, reject }]);
    schedule();
  });
}

export function userQuery(userId: string) {
  return queryOptions({
    queryKey: userQueryKey(userId),
    queryFn: () => fetchUser(userId),
    staleTime: 5 * 60_000,
  });
}
