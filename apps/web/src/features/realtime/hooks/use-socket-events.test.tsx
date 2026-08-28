import type { ServerToClientEvents } from "@opencord/shared/events";
import type { Message } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sessionQueryKey } from "@/features/auth/hooks/use-session";
import { serverChannelsQueryKey } from "@/features/channels/api/queries";
import { serverMembersQueryKey } from "@/features/members/api/queries";
import { channelMessagesQueryKey } from "@/features/messages/api/queries";
import type { MessageCache } from "@/features/messages/hooks/use-send-message";
import { serverRolesQueryKey } from "@/features/roles/api/queries";
import {
  serverQueryKey,
  serversQueryKey,
} from "@/features/servers/api/queries";
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
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-09-11T10:00:00.000Z",
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
    renderHook(
      () => {
        useSocketEvents();
      },
      { wrapper },
    );

    emit("message:create", { message: message() });

    expect(entries().map((entry) => entry.id)).toEqual(["m-1"]);
  });

  it("keeps the tombstone when an older update follows a delete", () => {
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
});
