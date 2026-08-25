import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { authClient, type Session } from "@/lib/auth-client";

export const sessionQueryKey = ["session"] as const;

export const sessionQuery = queryOptions({
  queryKey: sessionQueryKey,
  queryFn: async ({ signal }): Promise<Session | null> => {
    const { data, error } = await authClient.getSession({
      fetchOptions: { signal },
    });

    if (error) {
      throw new Error(error.message ?? "Could not read the session");
    }

    return data;
  },
  staleTime: 60_000,
});

export function useSession() {
  const { data, isPending, isError, refetch } = useQuery(sessionQuery);

  return {
    session: data ?? null,
    user: data?.user ?? null,
    isPending,
    isError,
    refetch,
  };
}

export function useSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();

      if (error) {
        throw new Error(error.message ?? "Could not sign you out");
      }
    },
    onSuccess: async () => {
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
  });
}
