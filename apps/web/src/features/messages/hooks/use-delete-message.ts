import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  channelMessageCaches,
  type MessageCache,
} from "@/features/messages/api/queries";
import {
  confirmDeleted,
  findMessage,
  mapMessage,
  restoreDeleted,
} from "@/features/messages/lib/cache";
import { accountScope, isCurrentScope } from "@/lib/account-scope";
import { api, ApiError } from "@/lib/api-client";
import { chatAlert } from "@/lib/toast";

export interface DeletedMessage {
  channelId: string;
  messageId: string;
  deletedAt: string;
}

export interface DeleteState {
  remove: (messageId: string) => void;
  isPending: boolean;
}

export function messageFor(error: Error): string {
  if (!(error instanceof ApiError)) {
    return "Could not delete the message";
  }

  switch (error.code) {
    case "NOT_THE_AUTHOR": {
      return "Only the author may delete this message";
    }
    case "TARGET_IS_OWNER": {
      return "The owner's messages are outside the hierarchy";
    }
    case "FORBIDDEN": {
      return "You cannot delete this message";
    }
    case "MESSAGE_NOT_FOUND": {
      return "That message is no longer here";
    }
    default: {
      return error.message;
    }
  }
}

export function useDeleteMessage(channelId: string): DeleteState {
  const queryClient = useQueryClient();
  const caches = channelMessageCaches(channelId);

  const { mutate, isPending } = useMutation({
    meta: { inline: true },
    mutationFn: (messageId: string) =>
      api<DeletedMessage>(`/channels/${channelId}/messages/${messageId}`, {
        method: "DELETE",
      }),

    onMutate: (messageId) => {
      const applied = new Date().toISOString();
      const before = queryClient
        .getQueriesData<MessageCache>(caches)
        .map(([, cache]) => findMessage(cache, messageId))
        .find((entry) => entry !== undefined);

      const replaced =
        before === undefined
          ? undefined
          : { content: before.content, deletedAt: before.deletedAt };

      queryClient.setQueriesData<MessageCache>(caches, (cache) =>
        mapMessage(cache, messageId, (message) => ({
          ...message,
          content: "",
          deletedAt: applied,
          pendingDelete: applied,
        })),
      );

      return { applied, replaced, scope: accountScope() };
    },

    onSuccess: (deleted, _messageId, context) => {
      if (!isCurrentScope(context.scope)) {
        return;
      }

      queryClient.setQueriesData<MessageCache>(caches, (cache) =>
        mapMessage(cache, deleted.messageId, (message) =>
          confirmDeleted(message, deleted.deletedAt),
        ),
      );
    },

    onError: (error, messageId, context) => {
      const { applied, replaced, scope } = context ?? {};

      if (
        replaced !== undefined &&
        scope !== undefined &&
        isCurrentScope(scope)
      ) {
        queryClient.setQueriesData<MessageCache>(caches, (cache) =>
          mapMessage(cache, messageId, (entry) =>
            entry.pendingDelete === applied
              ? restoreDeleted(entry, replaced)
              : entry,
          ),
        );
      }

      chatAlert(messageFor(error));
    },
  });

  const remove = useCallback(
    (messageId: string) => {
      mutate(messageId);
    },
    [mutate],
  );

  return { remove, isPending };
}
