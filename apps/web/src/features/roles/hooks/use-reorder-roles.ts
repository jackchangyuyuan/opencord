import type { ReorderRolesInput } from "@opencord/shared/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  type PublicRole,
  serverRolesQueryKey,
} from "@/features/roles/api/queries";
import { serverQueryKey } from "@/features/servers/api/queries";
import { api } from "@/lib/api-client";

export interface ReorderRolesState {
  reorder: (roleIds: string[]) => void;
  isPending: boolean;
}

function applyOrder(
  roles: readonly PublicRole[],
  roleIds: readonly string[],
): PublicRole[] {
  const byId = new Map(roles.map((role) => [role.id, role]));
  const moving = new Set(roleIds);
  const queue = [...roleIds];

  const merged = roles.map((role) => {
    if (!moving.has(role.id)) {
      return role;
    }

    const next = queue.shift();

    return (next === undefined ? undefined : byId.get(next)) ?? role;
  });

  let rank = 0;

  return merged.map((role) =>
    role.isDefault ? role : { ...role, position: (rank += 1) },
  );
}

export function useReorderRoles(serverId: string): ReorderRolesState {
  const queryClient = useQueryClient();
  const queryKey = serverRolesQueryKey(serverId);

  const mutation = useMutation({
    meta: { inline: true },
    mutationFn: (roleIds: string[]) =>
      api<unknown>(`/servers/${serverId}/roles/positions`, {
        method: "PATCH",
        body: { roleIds } satisfies ReorderRolesInput,
      }),
    onMutate: async (roleIds) => {
      await queryClient.cancelQueries({ queryKey });

      const previous = queryClient.getQueryData<PublicRole[]>(queryKey);

      queryClient.setQueryData<PublicRole[]>(queryKey, (roles) =>
        roles === undefined ? roles : applyOrder(roles, roleIds),
      );

      return { previous };
    },
    onError: (_error, _roleIds, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({
        queryKey: serverQueryKey(serverId),
      });
    },
  });

  return {
    reorder: (roleIds: string[]) => {
      mutation.mutate(roleIds);
    },
    isPending: mutation.isPending,
  };
}
