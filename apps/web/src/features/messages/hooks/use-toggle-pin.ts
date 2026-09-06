import type { Message } from "@opencord/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { channelPinsQueryKey } from "@/features/messages/api/queries";
import { api, ApiError } from "@/lib/api-client";

export interface TogglePinInput {
  messageId: string;
  pin: boolean;
}

export interface TogglePinState {
  togglePin: (input: TogglePinInput) => void;
  isPending: boolean;
  error: string | null;
}

export function useTogglePin(channelId: string): TogglePinState {
  const queryClient = useQueryClient();

  const { mutate, isPending, error } = useMutation({
    meta: { inline: true },
    mutationFn: ({ messageId, pin }: TogglePinInput) =>
      api<Message>(`/channels/${channelId}/messages/${messageId}/pin`, {
        method: pin ? "PUT" : "DELETE",
      }),

    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: channelPinsQueryKey(channelId),
      });
    },
  });

  const togglePin = useCallback(
    (input: TogglePinInput) => {
      mutate(input);
    },
    [mutate],
  );

  return {
    togglePin,
    isPending,
    error: error === null ? null : messageFor(error),
  };
}

function messageFor(error: Error): string {
  if (error instanceof ApiError && error.code === "PIN_LIMIT_REACHED") {
    return "This channel already has the maximum number of pins";
  }

  return error instanceof ApiError ? error.message : "Could not change the pin";
}
