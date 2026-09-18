import type { Message } from "@opencord/shared/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import {
  channelMessageCaches,
  type MessageCache,
} from "@/features/messages/api/queries";
import {
  carriesNewerContent,
  findMessage,
  mapMessage,
} from "@/features/messages/lib/cache";
import { accountScope, isCurrentScope } from "@/lib/account-scope";
import { api, ApiError } from "@/lib/api-client";
import { inSeries } from "@/lib/serial";
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

interface PendingEdits {
  pending: number;
  confirmed: string | undefined;
}

const editing = new Map<string, PendingEdits>();

function beginEdit(messageId: string, confirmed: string | undefined): void {
  const held = editing.get(messageId);

  if (held === undefined) {
    editing.set(messageId, { pending: 1, confirmed });
    return;
  }

  held.pending += 1;
}

function noteConfirmed(messageId: string, content: string): void {
  const held = editing.get(messageId);

  if (held !== undefined) {
    held.confirmed = content;
  }
}

function endEdit(messageId: string): {
  last: boolean;
  confirmed: string | undefined;
} {
  const held = editing.get(messageId);

  if (held === undefined) {
    return { last: false, confirmed: undefined };
  }

  held.pending -= 1;

  if (held.pending > 0) {
    return { last: false, confirmed: held.confirmed };
  }

  editing.delete(messageId);

  return { last: true, confirmed: held.confirmed };
}

export function useEditMessage(channelId: string): EditState {
  const queryClient = useQueryClient();

  const caches = channelMessageCaches(channelId);

  const { mutate, isPending } = useMutation({
    meta: { inline: true },
    mutationFn: ({ messageId, content }: EditInput) =>
      inSeries(messageId, () =>
        api<Message>(`/channels/${channelId}/messages/${messageId}`, {
          method: "PATCH",
          body: { content },
        }),
      ),

    onMutate: ({ messageId, content, optimisticContent }) => {
      const applied = optimisticContent ?? content;

      const held = queryClient
        .getQueriesData<MessageCache>(caches)
        .map(([, cache]) => findMessage(cache, messageId))
        .find((entry) => entry !== undefined);

      beginEdit(messageId, held?.content);

      queryClient.setQueriesData<MessageCache>(caches, (cache) =>
        mapMessage(cache, messageId, (message) => ({
          ...message,
          content: applied,
        })),
      );

      return { scope: accountScope() };
    },

    onSuccess: (message, { messageId }, context) => {
      noteConfirmed(messageId, message.content);

      const { last } = endEdit(messageId);

      if (!last || !isCurrentScope(context.scope)) {
        return;
      }

      queryClient.setQueriesData<MessageCache>(caches, (cache) =>
        mapMessage(cache, message.id, (entry) =>
          carriesNewerContent(message, entry)
            ? { ...entry, ...message, reactions: entry.reactions }
            : entry,
        ),
      );
    },

    onError: (error, { messageId }, context) => {
      const { last, confirmed } = endEdit(messageId);

      if (
        last &&
        confirmed !== undefined &&
        context !== undefined &&
        isCurrentScope(context.scope)
      ) {
        queryClient.setQueriesData<MessageCache>(caches, (cache) =>
          mapMessage(cache, messageId, (entry) =>
            entry.deletedAt === null ? { ...entry, content: confirmed } : entry,
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
