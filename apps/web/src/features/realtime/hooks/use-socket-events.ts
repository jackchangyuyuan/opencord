import type { ServerToClientEvents } from "@opencord/shared/events";
import type { Message } from "@opencord/shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { sessionQueryKey } from "@/features/auth/hooks/use-session";
import {
  type ChannelListEntry,
  channelQuery,
  isChannelList,
  serverChannelsQueryKey,
} from "@/features/channels/api/queries";
import { refreshUnread } from "@/features/channels/lib/refresh-unread";
import { dmsQueryKey } from "@/features/dms/api/queries";
import {
  isMemberList,
  serverMembersQueryKey,
} from "@/features/members/api/queries";
import type { MessageCache } from "@/features/messages/api/queries";
import {
  channelMessageCaches,
  channelMessagesQueryKey,
  channelPinsQueryKey,
} from "@/features/messages/api/queries";
import { noteReactionConfirmed } from "@/features/messages/hooks/use-toggle-reaction";
import { carriesNewerContent } from "@/features/messages/lib/cache";
import {
  applyMessageEvent,
  type MessageEvent,
} from "@/features/realtime/lib/apply-message-event";
import { serverRolesQueryKey } from "@/features/roles/api/queries";
import {
  serverQueryKey,
  serversQueryKey,
} from "@/features/servers/api/queries";
import { currentUserQuery, userQueryKey } from "@/features/users/api/queries";
import { socket } from "@/lib/socket";
import { usePresence } from "@/stores/presence";
import { useTyping } from "@/stores/typing";

type Handlers = {
  [Event in keyof ServerToClientEvents]?: ServerToClientEvents[Event];
};

export function useSocketEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const apply = (channelId: string, event: MessageEvent) => {
      if (event.type === "create") {
        if (
          queryClient.getQueryData<MessageCache>(
            channelMessagesQueryKey(channelId),
          ) === undefined
        ) {
          return;
        }

        queryClient.setQueryData<MessageCache>(
          channelMessagesQueryKey(channelId),
          (cache) => applyMessageEvent(cache, event),
        );
        return;
      }

      queryClient.setQueriesData<MessageCache>(
        channelMessageCaches(channelId),
        (cache) => applyMessageEvent(cache, event),
      );
    };

    const knowsChannel = (channelId: string) =>
      queryClient
        .getQueriesData<ChannelListEntry[]>({
          predicate: (query) => isChannelList(query.queryKey),
        })
        .some(([, channels]) =>
          (channels ?? []).some((channel) => channel.id === channelId),
        );

    const noteNewMessage = (
      channelId: string,
      messageId: string,
      notify: boolean,
    ) => {
      queryClient.setQueriesData<ChannelListEntry[]>(
        { predicate: (query) => isChannelList(query.queryKey) },
        (channels) =>
          channels?.map((channel) => {
            if (channel.id !== channelId) {
              return channel;
            }

            const unread =
              notify &&
              (channel.lastReadMessageId === null ||
                messageId > channel.lastReadMessageId);

            return {
              ...channel,
              lastMessageId:
                channel.lastMessageId !== null &&
                messageId < channel.lastMessageId
                  ? channel.lastMessageId
                  : messageId,
              hasUnread: channel.hasUnread || unread,
              unreadCount: channel.unreadCount + (unread ? 1 : 0),
            };
          }),
      );
    };

    const noteReaction = (
      payload: { messageId: string; emoji: string; userId: string },
      present: boolean,
    ) => {
      if (payload.userId === viewerId()) {
        noteReactionConfirmed(payload.messageId, payload.emoji, present);
      }
    };

    const viewerId = () =>
      queryClient.getQueryData<{ id: string }>(currentUserQuery.queryKey)?.id ??
      null;

    const invalidate = (queryKey: readonly unknown[]) => {
      void queryClient.invalidateQueries({ queryKey });
    };

    const invalidateChannelOverwrites = () => {
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey.length === 3 &&
          query.queryKey[0] === "channels" &&
          query.queryKey[2] === "overwrites",
      });
    };

    const editPinned = (message: Message) => {
      queryClient.setQueryData<Message[]>(
        channelPinsQueryKey(message.channelId),
        (pins) =>
          pins?.map((pin) =>
            pin.id === message.id && carriesNewerContent(message, pin)
              ? message
              : pin,
          ),
      );
    };

    const unpin = (channelId: string, messageId: string) => {
      queryClient.setQueryData<Message[]>(
        channelPinsQueryKey(channelId),
        (pins) => pins?.filter((pin) => pin.id !== messageId),
      );
    };

    const handlers: Handlers = {
      "message:create": ({ message }) => {
        if (!knowsChannel(message.channelId)) {
          invalidate(dmsQueryKey);
        }

        apply(message.channelId, { type: "create", message });
        noteNewMessage(
          message.channelId,
          message.id,
          message.authorId !== viewerId(),
        );
      },
      "message:update": ({ message }) => {
        editPinned(message);
        apply(message.channelId, { type: "update", message });
      },
      "message:pin": (payload) => {
        apply(payload.channelId, { type: "pin", payload });
        invalidate(channelPinsQueryKey(payload.channelId));
      },
      "message:delete": (payload) => {
        unpin(payload.channelId, payload.messageId);
        apply(payload.channelId, { type: "delete", payload });
      },
      "reaction:add": (payload) => {
        noteReaction(payload, true);
        apply(payload.channelId, {
          type: "reaction",
          add: true,
          payload,
          viewerId: viewerId(),
          at: Date.now(),
        });
      },
      "reaction:remove": (payload) => {
        noteReaction(payload, false);
        apply(payload.channelId, {
          type: "reaction",
          add: false,
          payload,
          viewerId: viewerId(),
          at: Date.now(),
        });
      },
      "unread:stale": ({ channelId }) => {
        refreshUnread(queryClient, channelId);
      },
      "channel:create": ({ serverId }) => {
        invalidate(serverChannelsQueryKey(serverId));
      },
      "channel:update": ({ serverId, channelId }) => {
        invalidate(serverChannelsQueryKey(serverId));
        invalidate(channelQuery(channelId).queryKey);
      },
      "channel:delete": ({ serverId, channelId }) => {
        invalidate(serverChannelsQueryKey(serverId));
        invalidate(channelQuery(channelId).queryKey);
      },
      "server:update": () => {
        invalidate(serversQueryKey);
      },
      "server:delete": () => {
        invalidate(serversQueryKey);
      },
      "member:join": ({ serverId }) => {
        invalidate(serverMembersQueryKey(serverId));
      },
      "member:leave": ({ serverId, userId }) => {
        invalidate(serverMembersQueryKey(serverId));

        if (userId === viewerId()) {
          invalidate(serversQueryKey);
          invalidate(serverChannelsQueryKey(serverId));
          invalidate(serverQueryKey(serverId));
        }
      },
      "role:update": ({ serverId }) => {
        invalidate(serverRolesQueryKey(serverId));
        invalidate(serverQueryKey(serverId));
        invalidate(serverMembersQueryKey(serverId));
      },
      "permissions:changed": ({ serverId }) => {
        invalidate(serverChannelsQueryKey(serverId));
        invalidate(serverQueryKey(serverId));
        invalidateChannelOverwrites();
      },
      "user:update": ({ userId }) => {
        invalidate(userQueryKey(userId));
        invalidate(dmsQueryKey);

        if (userId === viewerId()) {
          invalidate(currentUserQuery.queryKey);
        }

        void queryClient.invalidateQueries({
          predicate: (query) => isMemberList(query.queryKey),
        });
      },
      "presence:update": ({ userId, status }) => {
        usePresence.getState().setStatus(userId, status);
      },
      "typing:start": ({ channelId, userId }) => {
        useTyping.getState().start(channelId, userId);
      },

      "session:revoked": () => {
        invalidate(sessionQueryKey);
      },

      "system:reconnect": () => {
        socket.disconnect();
        socket.connect();
      },
    };

    const forgetEphemeralState = () => {
      usePresence.getState().reset();
      useTyping.getState().reset();
    };

    for (const [event, handler] of Object.entries(handlers)) {
      socket.on(event as keyof ServerToClientEvents, handler);
    }

    socket.on("disconnect", forgetEphemeralState);

    return () => {
      for (const [event, handler] of Object.entries(handlers)) {
        socket.off(event as keyof ServerToClientEvents, handler);
      }

      socket.off("disconnect", forgetEphemeralState);
    };
  }, [queryClient]);
}
