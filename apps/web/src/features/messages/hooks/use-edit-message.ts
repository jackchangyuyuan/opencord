import type { Message } from "@opencord/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  channelMessageCaches,
  type MessageCache,
} from "@/features/messages/api/queries";
import {
  findMessage,
  isNotStale,
  mapMessage,
} from "@/features/messages/lib/cache";
import { api, ApiError } from "@/lib/api-client";
import { chatAlert } from "@/lib/toast";

export interface EditInput {
  messageId: string;
  content: string;
  optimisticContent?: string;
}

export interface EditState {
  edit: (input: EditInput) => void;
  isPending: boolean;
}

export function messageFor(error: Error): string {
  if (!(error instanceof ApiError)) {
    return "Could not save the edit";
  }

  switch (error.code) {
    case "CONTENT_REQUIRED": {
      return "A message without an image needs some text";
    }
    case "NOT_THE_AUTHOR": {
      return "Only the author may edit a message";
    }
    case "MESSAGE_NOT_FOUND": {
      return "That message is no longer here";
    }
    default: {
      return error.message;
    }
  }
}

export function useEditMessage(channelId: string): EditState {
  const queryClient = useQueryClient();

  const caches = channelMessageCaches(channelId);

  const { mutate, isPending } = useMutation({
    meta: { inline: true },
    mutationFn: ({ messageId, content }: EditInput) =>
      api<Message>(`/channels/${channelId}/messages/${messageId}`, {
        method: "PATCH",
        body: { content },
      }),

    onMutate: ({ messageId, content, optimisticContent }) => {
      const applied = optimisticContent ?? content;

      const replaced = queryClient
        .getQueriesData<MessageCache>(caches)
        .map(([, cache]) => findMessage(cache, messageId))
        .find((entry) => entry !== undefined)?.content;

      queryClient.setQueriesData<MessageCache>(caches, (cache) =>
        mapMessage(cache, messageId, (message) => ({
          ...message,
          content: applied,
        })),
      );

      return { applied, replaced };
    },

    onSuccess: (message) => {
      queryClient.setQueriesData<MessageCache>(caches, (cache) =>
        mapMessage(cache, message.id, (entry) =>
          isNotStale(message, entry)
            ? { ...message, reactions: entry.reactions }
            : entry,
        ),
      );
    },

    onError: (error, { messageId }, context) => {
      const { applied, replaced } = context ?? {};

      if (replaced !== undefined) {
        queryClient.setQueriesData<MessageCache>(caches, (cache) =>
          mapMessage(cache, messageId, (entry) =>
            entry.content === applied ? { ...entry, content: replaced } : entry,
          ),
        );
      }

      chatAlert(messageFor(error));
    },
  });

  const edit = useCallback(
    (input: EditInput) => {
      mutate(input);
    },
    [mutate],
  );

  return { edit, isPending };
}
