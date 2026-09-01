import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  serverBansQueryKey,
  serverMembersQueryKey,
} from "@/features/members/api/queries";
import { serverRolesQueryKey } from "@/features/roles/api/queries";
import { api, ApiError } from "@/lib/api-client";

export interface MemberMutations {
  assignRole: (input: { userId: string; roleId: string }) => void;
  unassignRole: (input: { userId: string; roleId: string }) => void;
  kick: (userId: string) => void;
  ban: (input: { userId: string; reason: string }) => void;
  unban: (userId: string) => void;
  isPending: boolean;
  error: string | null;
}

function messageFor(error: Error | null): string | null {
  if (error === null) {
    return null;
  }

  return error instanceof ApiError ? error.message : "That action failed";
}

export function useMemberMutations(serverId: string): MemberMutations {
  const queryClient = useQueryClient();

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: serverMembersQueryKey(serverId),
    });
    await queryClient.invalidateQueries({
      queryKey: serverRolesQueryKey(serverId),
    });
    await queryClient.invalidateQueries({
      queryKey: serverBansQueryKey(serverId),
    });
  };

  const role = useMutation({
    mutationFn: ({
      userId,
      roleId,
      assign,
    }: {
      userId: string;
      roleId: string;
      assign: boolean;
    }) =>
      api<unknown>(`/servers/${serverId}/members/${userId}/roles/${roleId}`, {
        method: assign ? "PUT" : "DELETE",
      }),
    onSuccess: refresh,
  });

  const kick = useMutation({
    mutationFn: (userId: string) =>
      api<unknown>(`/servers/${serverId}/members/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: refresh,
  });

  const ban = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      api<unknown>(`/servers/${serverId}/bans/${userId}`, {
        method: "PUT",
        body: reason === "" ? {} : { reason },
      }),
    onSuccess: refresh,
  });

  const unban = useMutation({
    mutationFn: (userId: string) =>
      api<unknown>(`/servers/${serverId}/bans/${userId}`, { method: "DELETE" }),
    onSuccess: refresh,
  });

  return {
    assignRole: (input) => {
      role.mutate({ ...input, assign: true });
    },
    unassignRole: (input) => {
      role.mutate({ ...input, assign: false });
    },
    kick: (userId) => {
      kick.mutate(userId);
    },
    ban: (input) => {
      ban.mutate(input);
    },
    unban: (userId) => {
      unban.mutate(userId);
    },
    isPending:
      role.isPending || kick.isPending || ban.isPending || unban.isPending,
    error:
      messageFor(role.error) ??
      messageFor(kick.error) ??
      messageFor(ban.error) ??
      messageFor(unban.error),
  };
}
