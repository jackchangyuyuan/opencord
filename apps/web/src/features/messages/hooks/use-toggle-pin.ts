import type { Message } from "@opencord/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  channelMessageCaches,
  channelPinsQueryKey,
  type MessageCache,
} from "@/features/messages/api/queries";
import { mapMessage } from "@/features/messages/lib/cache";
import { api, ApiError } from "@/lib/api-client";
import { chatAlert } from "@/lib/toast";

export interface TogglePinInput {
  messageId: string;
  pin: boolean;
}

export interface TogglePinState {
  togglePin: (input: TogglePinInput) => void;
  isPending: boolean;
}

export function useTogglePin(channelId: string): TogglePinState {
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    meta: { inline: true },
    mutationFn: ({ messageId, pin }: TogglePinInput) =>
      api<Message>(`/channels/${channelId}/messages/${messageId}/pin`, {
        method: pin ? "PUT" : "DELETE",
      }),

    onSuccess: (message) => {
      queryClient.setQueriesData<MessageCache>(
        channelMessageCaches(channelId),
        (cache) =>
          mapMessage(cache, message.id, (entry) => ({
            ...entry,
            pinnedAt: message.pinnedAt,
            pinnedBy: message.pinnedBy,
          })),
      );

      void queryClient.invalidateQueries({
        queryKey: channelPinsQueryKey(channelId),
      });
    },

    onError: (error) => {
      chatAlert(messageFor(error));
    },
  });

  const togglePin = useCallback(
    (input: TogglePinInput) => {
      mutate(input);
    },
    [mutate],
  );

  return { togglePin, isPending };
}

function messageFor(error: Error): string {
  if (error instanceof ApiError && error.code === "PIN_LIMIT_REACHED") {
    return "This channel already has the maximum number of pins";
  }

  return error instanceof ApiError ? error.message : "Could not change the pin";
}
