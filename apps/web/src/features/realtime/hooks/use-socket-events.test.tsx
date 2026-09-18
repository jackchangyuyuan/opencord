import type { ServerToClientEvents } from "@opencord/shared/events";
import type { Message } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sessionQueryKey } from "@/features/auth/hooks/use-session";
import {
  channelQuery,
  serverChannelsQueryKey,
} from "@/features/channels/api/queries";
import { dmsQueryKey } from "@/features/dms/api/queries";
import { serverMembersQueryKey } from "@/features/members/api/queries";
import type { MessageCache } from "@/features/messages/api/queries";
import {
  channelMessagesAroundQueryKey,
  channelMessagesQueryKey,
  channelPinsQueryKey,
} from "@/features/messages/api/queries";
import { serverRolesQueryKey } from "@/features/roles/api/queries";
import {
  serverQueryKey,
  serversQueryKey,
} from "@/features/servers/api/queries";
import { currentUserQuery, userQueryKey } from "@/features/users/api/queries";
import { usePresence } from "@/stores/presence";
import { useTyping } from "@/stores/typing";

const { listenerCount, rawEmit, reset, socket } = vi.hoisted(() => {
  type Listener = (...args: unknown[]) => void;

  const listeners = new Map<string, Set<Listener>>();

  return {
    socket: {
      on: (event: string, listener: Listener) => {
        const registered = listeners.get(event) ?? new Set<Listener>();

        registered.add(listener);
        listeners.set(event, registered);
      },
      off: (event: string, listener: Listener) => {
        listeners.get(event)?.delete(listener);
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    },

    listenerCount: () =>
      [...listeners.values()].reduce((total, set) => total + set.size, 0),

    rawEmit: (event: string, ...args: unknown[]) => {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        listener(...args);
      }
    },

    reset: () => {
      listeners.clear();
    },
  };
});

vi.mock("@/lib/socket", () => ({ socket }));

const { useSocketEvents } = await import("./use-socket-events");

const CHANNEL_ID = "66666666-6666-4666-8666-666666666666";
const SERVER_ID = "77777777-7777-4777-8777-777777777777";

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "m-1",
    channelId: CHANNEL_ID,
    authorId: "u-ada",
    content: "hello",
    nonce: null,
    replyToId: null,
    replyTo: null,
    pinnedAt: null,
    pinnedBy: null,
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-09-11T10:00:00.000Z",
    reactions: [],
    attachments: [],
    ...overrides,
  };
}

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function emit<E extends keyof ServerToClientEvents>(
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
): void {
  act(() => {
    rawEmit(event, ...args);
  });
}

function cached(): MessageCache | undefined {
  return client.getQueryData<MessageCache>(channelMessagesQueryKey(CHANNEL_ID));
}

function seedHistory(data: Message[] = []): void {
  client.setQueryData<MessageCache>(channelMessagesQueryKey(CHANNEL_ID), {
    pageParams: [null],
    pages: [{ data, nextCursor: null }],
  });
}

function seedChannelList(): void {
  client.setQueryData(serverChannelsQueryKey(SERVER_ID), [
    {
      id: CHANNEL_ID,
      serverId: SERVER_ID,
      type: "text",
      name: "general",
      topic: null,
      position: 0,
      lastMessageId: null,
      lastReadMessageId: null,
      hasUnread: false,
      hasEveryone: false,
      mentionCount: 0,
      createdAt: "2026-09-11T10:00:00.000Z",
    },
  ]);
}

function channelRow() {
  return client
    .getQueryData<
      {
        id: string;
        hasUnread: boolean;
        lastMessageId: string | null;
        mentionCount: number;
      }[]
    >(serverChannelsQueryKey(SERVER_ID))
    ?.find((channel) => channel.id === CHANNEL_ID);
}

function signIn(userId: string): void {
  client.setQueryData(currentUserQuery.queryKey, {
    id: userId,
    username: "ada",
    name: "Ada",
    avatarUrl: null,
    description: null,
    customStatus: null,
    customStatusEmoji: null,
    isGuest: false,
  });
}

function entries() {
  return cached()?.pages.flatMap((page) => page.data) ?? [];
}

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  usePresence.setState({ byUser: {}, self: "online" });
  useTyping.getState().reset();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

describe("useSocketEvents", () => {
  it("applies message:create into the channel's cache", () => {
    seedHistory();
    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:create", { message: message() });

    expect(entries().map((entry) => entry.id)).toEqual(["m-1"]);
  });

  it("does not invent a history for a channel nobody has opened", () => {
    seedChannelList();
    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:create", { message: message({ authorId: "u-grace" }) });

    expect(cached()).toBeUndefined();
    expect(channelRow()?.hasUnread).toBe(true);
  });

  it("does not mark a channel unread for a message you sent yourself", () => {
    signIn("u-ada");
    seedChannelList();
    seedHistory();

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:create", { message: message({ authorId: "u-ada" }) });

    expect(entries().map((entry) => entry.id)).toEqual(["m-1"]);
    expect(channelRow()?.hasUnread).toBe(false);
    expect(channelRow()?.lastMessageId).toBe("m-1");
  });

  it("marks a channel unread for a message somebody else sent", () => {
    signIn("u-ada");
    seedChannelList();

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:create", { message: message({ authorId: "u-grace" }) });

    expect(channelRow()?.hasUnread).toBe(true);
    expect(channelRow()?.lastMessageId).toBe("m-1");
  });

  it("leaves an existing unread dot alone when you send into that channel", () => {
    signIn("u-ada");
    seedChannelList();

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:create", { message: message({ authorId: "u-grace" }) });
    emit("message:create", {
      message: message({ id: "m-2", authorId: "u-ada" }),
    });

    expect(channelRow()?.hasUnread).toBe(true);
  });

  it("keeps the tombstone when an older update follows a delete", () => {
    seedHistory();
    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:create", {
      message: message({ editedAt: "2026-09-11T10:05:00.000Z" }),
    });

    emit("message:delete", {
      channelId: CHANNEL_ID,
      messageId: "m-1",
      deletedAt: "2026-09-11T10:06:00.000Z",
    });

    emit("message:update", {
      message: message({
        content: "resurrected",
        editedAt: "2026-09-11T10:04:00.000Z",
      }),
    });

    const [entry] = entries();

    expect(entry?.deletedAt).toBe("2026-09-11T10:06:00.000Z");
    expect(entry?.content).toBe("");
  });

  it("discards an update whose editedAt predates the cached one", () => {
    seedHistory();
    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:create", {
      message: message({
        content: "newer",
        editedAt: "2026-09-11T10:05:00.000Z",
      }),
    });

    emit("message:update", {
      message: message({
        content: "older",
        editedAt: "2026-09-11T10:04:00.000Z",
      }),
    });

    expect(entries()[0]?.content).toBe("newer");
  });

  it("applies a newer update", () => {
    seedHistory();
    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:create", {
      message: message({
        content: "first",
        editedAt: "2026-09-11T10:04:00.000Z",
      }),
    });

    emit("message:update", {
      message: message({
        content: "edited",
        editedAt: "2026-09-11T10:05:00.000Z",
      }),
    });

    expect(entries()[0]?.content).toBe("edited");
  });

  it("ignores an update for a message the cache never held", () => {
    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:update", { message: message({ content: "ghost" }) });

    expect(entries()).toHaveLength(0);
  });

  it("blanks the quoted line of a message that was deleted", () => {
    seedHistory([
      message({
        id: "m-2",
        content: "agreed",
        replyToId: "m-1",
        replyTo: {
          id: "m-1",
          authorId: "u-ada",
          content: "the deploy is green",
          deletedAt: null,
        },
      }),
    ]);

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:delete", {
      channelId: CHANNEL_ID,
      messageId: "m-1",
      deletedAt: "2026-09-11T10:06:00.000Z",
    });

    expect(entries()[0]?.replyTo).toEqual({
      id: "m-1",
      authorId: "u-ada",
      content: "",
      deletedAt: "2026-09-11T10:06:00.000Z",
    });
  });

  it("rewrites the quoted line of a message that was edited", () => {
    seedHistory([
      message({
        id: "m-2",
        content: "agreed",
        replyToId: "m-1",
        replyTo: {
          id: "m-1",
          authorId: "u-ada",
          content: "the deploy is green",
          deletedAt: null,
        },
      }),
    ]);

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:update", {
      message: message({
        id: "m-1",
        content: "the deploy is red",
        editedAt: "2026-09-11T10:06:00.000Z",
      }),
    });

    expect(entries()[0]?.replyTo?.content).toBe("the deploy is red");
  });

  it("rewrites a pinned message the popover is already showing", () => {
    seedHistory([message({ pinnedAt: "2026-09-11T10:01:00.000Z" })]);
    client.setQueryData(channelPinsQueryKey(CHANNEL_ID), [
      message({ pinnedAt: "2026-09-11T10:01:00.000Z" }),
    ]);

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:update", {
      message: message({
        content: "edited while pinned",
        pinnedAt: "2026-09-11T10:01:00.000Z",
        editedAt: "2026-09-11T10:06:00.000Z",
      }),
    });

    expect(
      client.getQueryData<Message[]>(channelPinsQueryKey(CHANNEL_ID))?.[0]
        ?.content,
    ).toBe("edited while pinned");
  });

  it("takes a deleted message out of the pin list", () => {
    seedHistory([message({ pinnedAt: "2026-09-11T10:01:00.000Z" })]);
    client.setQueryData(channelPinsQueryKey(CHANNEL_ID), [
      message({ pinnedAt: "2026-09-11T10:01:00.000Z" }),
    ]);

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:delete", {
      channelId: CHANNEL_ID,
      messageId: "m-1",
      deletedAt: "2026-09-11T10:06:00.000Z",
    });

    expect(
      client.getQueryData<Message[]>(channelPinsQueryKey(CHANNEL_ID))?.length,
    ).toBe(0);
  });

  it("refreshes the channel itself when it is renamed", () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("channel:update", { serverId: SERVER_ID, channelId: CHANNEL_ID });

    const keys = invalidate.mock.calls.map(([options]) => options?.queryKey);

    expect(keys).toContainEqual(serverChannelsQueryKey(SERVER_ID));
    expect(keys).toContainEqual(channelQuery(CHANNEL_ID).queryKey);
  });

  it("never moves a channel's newest-message pointer backwards", () => {
    seedHistory();
    seedChannelList();
    signIn("u-ada");

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:create", { message: message({ id: "m-9" }) });
    emit("message:create", { message: message({ id: "m-2" }) });

    expect(channelRow()?.lastMessageId).toBe("m-9");
  });

  it("refreshes every cache a permission change can invalidate", () => {
    const overwritesKey = ["channels", CHANNEL_ID, "overwrites"] as const;

    client.setQueryData(serverChannelsQueryKey(SERVER_ID), []);
    client.setQueryData(overwritesKey, { roles: [], members: [] });
    client.setQueryData(channelMessagesQueryKey(CHANNEL_ID), {
      pages: [{ data: [], nextCursor: null }],
      pageParams: [null],
    });

    const invalidate = vi.spyOn(client, "invalidateQueries");

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("permissions:changed", { serverId: SERVER_ID });

    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: serverChannelsQueryKey(SERVER_ID),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: serverQueryKey(SERVER_ID),
    });

    expect(client.getQueryState(overwritesKey)?.isInvalidated).toBe(true);
    expect(
      client.getQueryState(channelMessagesQueryKey(CHANNEL_ID))?.isInvalidated,
    ).toBe(false);
  });

  it("refreshes the member list when a role assignment changes", () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("role:update", { serverId: SERVER_ID });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: serverRolesQueryKey(SERVER_ID),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: serverQueryKey(SERVER_ID),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: serverMembersQueryKey(SERVER_ID),
    });
  });

  it("forgets remote presence and typing when the socket drops", () => {
    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("presence:update", { userId: "u-ada", status: "online" });
    emit("typing:start", { channelId: CHANNEL_ID, userId: "u-ada" });

    expect(usePresence.getState().byUser["u-ada"]).toBe("online");

    act(() => {
      rawEmit("disconnect");
    });

    expect(usePresence.getState().byUser).toEqual({});
    expect(useTyping.getState().byChannel[CHANNEL_ID] ?? []).toEqual([]);
  });

  it("invalidates the server list on server:update and the member list on member:join", () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("server:update", { serverId: SERVER_ID });
    emit("member:join", { serverId: SERVER_ID, userId: "u-grace" });

    expect(invalidate).toHaveBeenNthCalledWith(1, {
      queryKey: serversQueryKey,
    });
    expect(invalidate).toHaveBeenNthCalledWith(2, {
      queryKey: serverMembersQueryKey(SERVER_ID),
    });
  });

  it("refetches every surface that renders a user on user:update", () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");

    client.setQueryData(currentUserQuery.queryKey, {
      id: "u-me",
      username: "me",
      name: "Me",
      avatarUrl: null,
      description: null,
      customStatus: null,
      customStatusEmoji: null,
      isGuest: false,
    });

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("user:update", { userId: "u-ada" });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: userQueryKey("u-ada"),
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: dmsQueryKey });
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: currentUserQuery.queryKey,
    });

    const predicate = invalidate.mock.calls
      .map(([argument]) => argument)
      .find(
        (argument) => argument !== undefined && "predicate" in argument,
      )?.predicate;

    expect(predicate).toBeDefined();
    expect(
      predicate?.({
        queryKey: serverMembersQueryKey(SERVER_ID),
      } as never),
    ).toBe(true);
    expect(
      predicate?.({ queryKey: ["channels", CHANNEL_ID, "members"] } as never),
    ).toBe(true);
    expect(predicate?.({ queryKey: ["servers"] } as never)).toBe(false);
  });

  it("re-reads your own profile when the edit was yours", () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");

    client.setQueryData(currentUserQuery.queryKey, {
      id: "u-me",
      username: "me",
      name: "Me",
      avatarUrl: null,
      description: null,
      customStatus: null,
      customStatusEmoji: null,
      isGuest: false,
    });

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("user:update", { userId: "u-me" });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: currentUserQuery.queryKey,
    });
  });

  it("records a presence aggregate the server broadcast", () => {
    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("presence:update", { userId: "u-ada", status: "idle" });

    expect(usePresence.getState().byUser["u-ada"]).toBe("idle");
  });

  it("adds a typist to the channel the event names", () => {
    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("typing:start", { channelId: CHANNEL_ID, userId: "u-ada" });

    expect(useTyping.getState().byChannel[CHANNEL_ID]).toEqual(["u-ada"]);
  });

  it("re-reads the session when the server revokes it", () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("session:revoked");

    expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionQueryKey });
  });

  it("reconnects at once when its instance says it is draining", () => {
    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("system:reconnect");

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it("applies an update to an open jump window as well as the live list", () => {
    const aroundKey = channelMessagesAroundQueryKey(CHANNEL_ID, "m-1");

    const seeded: MessageCache = {
      pages: [{ data: [message()], nextCursor: null }],
      pageParams: [null],
    };

    client.setQueryData(channelMessagesQueryKey(CHANNEL_ID), seeded);
    client.setQueryData(aroundKey, seeded);

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:update", {
      message: message({
        content: "edited",
        editedAt: "2026-09-11T10:05:00.000Z",
      }),
    });

    expect(
      client.getQueryData<MessageCache>(aroundKey)?.pages[0]?.data[0]?.content,
    ).toBe("edited");
  });

  it("leaves a jump window alone when a new message arrives", () => {
    const aroundKey = channelMessagesAroundQueryKey(CHANNEL_ID, "m-1");

    client.setQueryData<MessageCache>(aroundKey, {
      pages: [{ data: [message()], nextCursor: null }],
      pageParams: [null],
    });

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:create", { message: message({ id: "m-2" }) });

    expect(
      client.getQueryData<MessageCache>(aroundKey)?.pages[0]?.data,
    ).toHaveLength(1);
  });

  it("unsubscribes every handler on unmount", () => {
    const { unmount } = renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    expect(listenerCount()).toBeGreaterThan(0);

    unmount();

    expect(listenerCount()).toBe(0);
  });

  it("re-reads a channel's unread state when the server says it is stale", async () => {
    seedChannelList();

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: CHANNEL_ID,
          serverId: SERVER_ID,
          type: "text",
          name: "general",
          topic: null,
          position: 0,
          lastMessageId: "m-9",
          lastEveryoneMentionId: null,
          createdAt: "2026-09-11T10:00:00.000Z",
          lastReadMessageId: null,
          hasUnread: true,
          hasEveryone: false,
          mentionCount: 3,
          unreadCount: 4,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("unread:stale", { channelId: CHANNEL_ID });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/channels/${CHANNEL_ID}/read`,
        expect.objectContaining({ method: "GET" }),
      );
    });

    await vi.waitFor(() => {
      expect(channelRow()?.mentionCount).toBe(3);
    });

    expect(channelRow()?.hasUnread).toBe(true);

    vi.unstubAllGlobals();
  });

  it("asks once for a burst of announcements about the same channel", async () => {
    seedChannelList();

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ mentionCount: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("unread:stale", { channelId: CHANNEL_ID });
    emit("unread:stale", { channelId: CHANNEL_ID });
    emit("unread:stale", { channelId: CHANNEL_ID });

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    vi.unstubAllGlobals();
  });

  it("reconciles the viewer's own membership when they are the one removed", () => {
    signIn("u-me");

    const invalidate = vi.spyOn(client, "invalidateQueries");

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("member:leave", { serverId: SERVER_ID, userId: "u-me" });

    const keys = invalidate.mock.calls.map(([options]) =>
      JSON.stringify((options as { queryKey?: unknown }).queryKey),
    );

    expect(keys).toContain(JSON.stringify(serverMembersQueryKey(SERVER_ID)));
    expect(keys).toContain(JSON.stringify(serversQueryKey));
    expect(keys).toContain(JSON.stringify(serverChannelsQueryKey(SERVER_ID)));
  });

  it("refreshes only the roster when somebody else is removed", () => {
    signIn("u-me");

    const invalidate = vi.spyOn(client, "invalidateQueries");

    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("member:leave", { serverId: SERVER_ID, userId: "u-grace" });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: serverMembersQueryKey(SERVER_ID),
    });
  });
});
