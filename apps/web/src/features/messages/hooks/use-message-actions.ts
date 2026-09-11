import { Permissions } from "@opencord/shared/permissions";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { channelQuery } from "@/features/channels/api/queries";
import { useDeleteMessage } from "@/features/messages/hooks/use-delete-message";
import { useEditMessage } from "@/features/messages/hooks/use-edit-message";
import { useSendMessage } from "@/features/messages/hooks/use-send-message";
import { useTogglePin } from "@/features/messages/hooks/use-toggle-pin";
import { useToggleReaction } from "@/features/messages/hooks/use-toggle-reaction";
import type { ChatMessage } from "@/features/messages/lib/cache";
import {
  has,
  mayDeleteMessage,
  useChannelPermissions,
} from "@/features/permissions/hooks/use-permissions";
import { currentUserQuery } from "@/features/users/api/queries";
import { useUi } from "@/stores/ui";

interface EditTarget {
  channelId: string;
  messageId: string;
}

export interface MessageActions {
  editingId: string | null;
  confirming: ChatMessage | null;
  closeConfirm: () => void;
  confirmDelete: () => void;

  mayReact: boolean;
  mayManageMessages: boolean;
  mayDelete: (authorId: string) => boolean;

  onReply: (entry: ChatMessage) => void;
  onRetry: (entry: ChatMessage) => void;
  onDiscard: (entry: ChatMessage) => void;
  onToggleReaction: (messageId: string, emoji: string, add: boolean) => void;
  onEdit: (entry: ChatMessage) => void;
  onCancelEdit: () => void;
  onSaveEdit: (entry: ChatMessage, content: string, optimistic: string) => void;
  onDelete: (entry: ChatMessage) => void;
  onTogglePin: (entry: ChatMessage) => void;
}

export function useMessageActions(
  channelId: string | undefined,
): MessageActions {
  const target = channelId ?? "";
  const enabled = channelId !== undefined;

  const { data: me } = useQuery(currentUserQuery);
  const { data: channel } = useQuery({ ...channelQuery(target), enabled });

  const { retry, discard } = useSendMessage(target);
  const { toggle: toggleReaction } = useToggleReaction(target);
  const { togglePin } = useTogglePin(target);
  const { edit } = useEditMessage(target);
  const { remove } = useDeleteMessage(target);
  const setReplyTarget = useUi((state) => state.setReplyTarget);

  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [confirming, setConfirming] = useState<ChatMessage | null>(null);

  const permissions = useChannelPermissions(channelId);
  const myId = me?.id;

  const onReply = useCallback(
    (entry: ChatMessage) => {
      setReplyTarget({
        channelId: entry.channelId,
        messageId: entry.id,
        authorId: entry.authorId,
        content: entry.content,
      });
    },
    [setReplyTarget],
  );

  const onRetry = useCallback(
    (entry: ChatMessage) => {
      if (myId !== undefined) {
        retry(entry, myId);
      }
    },
    [myId, retry],
  );

  const onToggleReaction = useCallback(
    (messageId: string, emoji: string, add: boolean) => {
      toggleReaction({ messageId, emoji, add });
    },
    [toggleReaction],
  );

  const onCancelEdit = useCallback(() => {
    setEditing(null);
  }, []);

  const onSaveEdit = useCallback(
    (entry: ChatMessage, content: string, optimistic: string) => {
      setEditing(null);
      edit({ messageId: entry.id, content, optimisticContent: optimistic });
    },
    [edit],
  );

  const onEdit = useCallback((entry: ChatMessage) => {
    setEditing({ channelId: entry.channelId, messageId: entry.id });
  }, []);

  const onDelete = useCallback((entry: ChatMessage) => {
    setConfirming(entry);
  }, []);

  const onTogglePin = useCallback(
    (entry: ChatMessage) => {
      togglePin({ messageId: entry.id, pin: entry.pinnedAt === null });
    },
    [togglePin],
  );

  const closeConfirm = useCallback(() => {
    setConfirming(null);
  }, []);

  const confirmDelete = useCallback(() => {
    if (confirming !== null) {
      remove(confirming.id);
    }

    setConfirming(null);
  }, [confirming, remove]);

  const mayDelete = useCallback(
    (authorId: string) =>
      mayDeleteMessage(
        {
          viewerId: myId,
          permissions,
          isDirectMessage: channel?.serverId === null,
        },
        authorId,
      ),
    [channel?.serverId, myId, permissions],
  );

  return {
    editingId:
      editing !== null && editing.channelId === channelId
        ? editing.messageId
        : null,
    confirming,
    closeConfirm,
    confirmDelete,

    mayReact: has(permissions, Permissions.ADD_REACTIONS),
    mayManageMessages: has(permissions, Permissions.MANAGE_MESSAGES),
    mayDelete,

    onReply,
    onRetry,
    onDiscard: discard,
    onToggleReaction,
    onEdit,
    onCancelEdit,
    onSaveEdit,
    onDelete,
    onTogglePin,
  };
}
