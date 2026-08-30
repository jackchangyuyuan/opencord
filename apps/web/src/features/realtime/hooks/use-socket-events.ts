import type { ServerToClientEvents } from "@opencord/shared/events";
import type { Message } from "@opencord/shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { sessionQueryKey } from "@/features/auth/hooks/use-session";
import {
  type ChannelListEntry,
  serverChannelsQueryKey,
} from "@/features/channels/api/queries";
import { serverMembersQueryKey } from "@/features/members/api/queries";
import {
  channelMessageCaches,
  channelMessagesQueryKey,
  channelPinsQueryKey,
} from "@/features/messages/api/queries";
import type { MessageCache } from "@/features/messages/hooks/use-send-message";
import {
  applyMessageEvent,
  type MessageEvent,
  pinStateChanged,
} from "@/features/realtime/lib/apply-message-event";
import { serverRolesQueryKey } from "@/features/roles/api/queries";
import {
  serverQueryKey,
  serversQueryKey,
} from "@/features/servers/api/queries";
import { currentUserQuery } from "@/features/users/api/queries";
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

    const markUnread = (channelId: string, messageId: string) => {
      queryClient.setQueriesData<ChannelListEntry[]>(
        {
          predicate: (query) =>
            query.queryKey.length === 3 &&
            query.queryKey[0] === "servers" &&
            query.queryKey[2] === "channels",
        },
        (channels) =>
          channels?.map((channel) =>
            channel.id === channelId
              ? {
                  ...channel,
                  lastMessageId: messageId,
                  hasUnread:
                    channel.lastReadMessageId === null ||
                    messageId > channel.lastReadMessageId,
                }
              : channel,
          ),
      );
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

    const syncPins = (message: Message) => {
      const cache = queryClient.getQueryData<MessageCache>(
        channelMessagesQueryKey(message.channelId),
      );

      if (pinStateChanged(cache, message)) {
        invalidate(channelPinsQueryKey(message.channelId));
      }
    };

    const handlers: Handlers = {
      "message:create": ({ message }) => {
        apply(message.channelId, { type: "create", message });
        markUnread(message.channelId, message.id);
      },
      "message:update": ({ message }) => {
        syncPins(message);
        apply(message.channelId, { type: "update", message });
      },
      "message:delete": (payload) => {
        apply(payload.channelId, { type: "delete", payload });
      },
      "reaction:add": (payload) => {
        apply(payload.channelId, {
          type: "reaction",
          add: true,
          payload,
          viewerId: viewerId(),
        });
      },
      "reaction:remove": (payload) => {
        apply(payload.channelId, {
          type: "reaction",
          add: false,
          payload,
          viewerId: viewerId(),
        });
      },
      "channel:create": ({ serverId }) => {
        invalidate(serverChannelsQueryKey(serverId));
      },
      "channel:update": ({ serverId }) => {
        invalidate(serverChannelsQueryKey(serverId));
      },
      "channel:delete": ({ serverId }) => {
        invalidate(serverChannelsQueryKey(serverId));
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
      "member:leave": ({ serverId }) => {
        invalidate(serverMembersQueryKey(serverId));
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
