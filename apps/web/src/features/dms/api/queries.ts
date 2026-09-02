import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "react-router";

import type { ChannelListEntry } from "@/features/channels/api/queries";
import type { PublicUser } from "@/features/members/api/queries";
import { api } from "@/lib/api-client";

export interface DmEntry extends ChannelListEntry {
  recipient: PublicUser;
}

export const dmsQueryKey = ["dms"] as const;

export const dmsQuery = queryOptions({
  queryKey: dmsQueryKey,
  queryFn: ({ signal }) => api<DmEntry[]>("/dms", { signal }),
});

export function dmParticipantsQueryKey(channelId: string) {
  return ["channels", channelId, "members"] as const;
}

export function dmParticipantsQuery(channelId: string) {
  return queryOptions({
    queryKey: dmParticipantsQueryKey(channelId),
    queryFn: ({ signal }) =>
      api<PublicUser[]>(`/channels/${channelId}/members`, { signal }),
  });
}

export function useOpenDm() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: (recipientId: string) =>
      api<{ id: string }>("/dms", {
        method: "POST",
        body: { recipientId },
      }),
    onSuccess: async (channel) => {
      await queryClient.invalidateQueries({ queryKey: dmsQueryKey });
      await navigate(`/app/channels/${channel.id}`);
    },
  });

  return {
    openDm: (recipientId: string) => {
      mutation.mutate(recipientId);
    },
    isPending: mutation.isPending,
    error: mutation.error === null ? null : "Could not open that conversation.",
  };
}
