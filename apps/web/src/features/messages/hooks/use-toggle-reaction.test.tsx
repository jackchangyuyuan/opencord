import type { Message } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MessageCache } from "@/features/messages/api/queries";
import {
  channelMessagesAroundQueryKey,
  channelMessagesQueryKey,
} from "@/features/messages/api/queries";
import { applyMessageEvent } from "@/features/realtime/lib/apply-message-event";

import {
  noteReactionConfirmed,
  useToggleReaction,
} from "./use-toggle-reaction";

const chatAlert = vi.hoisted(() => vi.fn<(title: string) => void>());

vi.mock("@/lib/toast", () => ({ chatAlert }));

const CHANNEL_ID = "99999999-9999-4999-8999-999999999999";
const MESSAGE_ID = "m-1";
const VIEWER_ID = "u-ada";

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: MESSAGE_ID,
    channelId: CHANNEL_ID,
    authorId: VIEWER_ID,
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

function cacheWith(reactions: Message["reactions"]): MessageCache {
  return {
    pages: [{ data: [message({ reactions })], nextCursor: null }],
    pageParams: [null],
  };
}

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function reactionsIn(key: readonly unknown[]): Message["reactions"] {
  return (
    client.getQueryData<MessageCache>(key)?.pages[0]?.data[0]?.reactions ?? []
  );
}

beforeEach(() => {
  chatAlert.mockClear();

  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toggling a reaction", () => {
  it("rolls back to the exact prior count when the server refuses", async () => {
    client.setQueryData<MessageCache>(
      channelMessagesQueryKey(CHANNEL_ID),
      cacheWith([{ emoji: "👍", count: 2, me: false }]),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          respond(403, { error: { code: "FORBIDDEN", message: "Forbidden" } }),
        ),
      ),
    );

    const { result } = renderHook(() => useToggleReaction(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.toggle({ messageId: MESSAGE_ID, emoji: "👍", add: true });
    });

    await waitFor(() => {
      expect(chatAlert).toHaveBeenCalledWith(
        "You cannot react in this channel",
      );
    });

    expect(reactionsIn(channelMessagesQueryKey(CHANNEL_ID))).toEqual([
      { emoji: "👍", count: 2, me: false },
    ]);
  });

  it("keeps what arrived while the refused request was in flight", async () => {
    const key = channelMessagesQueryKey(CHANNEL_ID);

    client.setQueryData<MessageCache>(
      key,
      cacheWith([{ emoji: "👍", count: 2, me: false }]),
    );

    let refuse = (): void => undefined;

    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          refuse = () => {
            resolve(
              respond(403, {
                error: { code: "FORBIDDEN", message: "Forbidden" },
              }),
            );
          };
        }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useToggleReaction(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.toggle({ messageId: MESSAGE_ID, emoji: "👍", add: true });
    });

    expect(reactionsIn(key)).toEqual([{ emoji: "👍", count: 3, me: true }]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    act(() => {
      client.setQueryData<MessageCache>(key, (cache) =>
        applyMessageEvent(cache, {
          type: "reaction",
          add: true,
          payload: {
            channelId: CHANNEL_ID,
            messageId: MESSAGE_ID,
            userId: "u-grace",
            emoji: "🎉",
          },
          viewerId: VIEWER_ID,
          at: Date.now(),
        }),
      );
    });

    act(() => {
      refuse();
    });

    await waitFor(() => {
      expect(chatAlert).toHaveBeenCalledWith(
        "You cannot react in this channel",
      );
    });

    expect(reactionsIn(key)).toEqual([
      { emoji: "👍", count: 2, me: false },
      { emoji: "🎉", count: 1, me: false },
    ]);
  });

  it("reacts inside an open jump window, and rolls that back too", async () => {
    const aroundKey = channelMessagesAroundQueryKey(CHANNEL_ID, MESSAGE_ID);

    client.setQueryData<MessageCache>(aroundKey, cacheWith([]));

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          respond(403, { error: { code: "FORBIDDEN", message: "Forbidden" } }),
        ),
      ),
    );

    const { result } = renderHook(() => useToggleReaction(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.toggle({ messageId: MESSAGE_ID, emoji: "🔥", add: true });
    });

    expect(reactionsIn(aroundKey)).toEqual([
      { emoji: "🔥", count: 1, me: true },
    ]);

    await waitFor(() => {
      expect(chatAlert).toHaveBeenCalled();
    });

    expect(reactionsIn(aroundKey)).toEqual([]);
  });
});

describe("the caller's own reaction echo", () => {
  it("does not increment a second time", () => {
    const optimistic = cacheWith([{ emoji: "👍", count: 1, me: true }]);

    const next = applyMessageEvent(optimistic, {
      type: "reaction",
      add: true,
      payload: {
        channelId: CHANNEL_ID,
        messageId: MESSAGE_ID,
        userId: VIEWER_ID,
        emoji: "👍",
      },
      viewerId: VIEWER_ID,
      at: Date.now(),
    });

    expect(next?.pages[0]?.data[0]?.reactions).toEqual([
      { emoji: "👍", count: 1, me: true },
    ]);
  });

  it("still counts someone else's arrival", () => {
    const next = applyMessageEvent(
      cacheWith([{ emoji: "👍", count: 1, me: true }]),
      {
        type: "reaction",
        add: true,
        payload: {
          channelId: CHANNEL_ID,
          messageId: MESSAGE_ID,
          userId: "u-grace",
          emoji: "👍",
        },
        viewerId: VIEWER_ID,
        at: Date.now(),
      },
    );

    expect(next?.pages[0]?.data[0]?.reactions).toEqual([
      { emoji: "👍", count: 2, me: true },
    ]);
  });
});

describe("a reaction toggled twice before either request answers", () => {
  const key = channelMessagesQueryKey(CHANNEL_ID);

  it("leaves no reaction behind when the add and the remove both fail", async () => {
    const failures: ((error: Error) => void)[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((_resolve, reject) => {
            failures.push(reject);
          }),
      ),
    );

    client.setQueryData<MessageCache>(key, cacheWith([]));

    const { result } = renderHook(() => useToggleReaction(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.toggle({ messageId: MESSAGE_ID, emoji: "👍", add: true });
    });

    expect(reactionsIn(key)).toEqual([{ emoji: "👍", count: 1, me: true }]);

    act(() => {
      result.current.toggle({ messageId: MESSAGE_ID, emoji: "👍", add: false });
    });

    expect(reactionsIn(key)).toEqual([]);

    await waitFor(() => {
      expect(failures).toHaveLength(1);
    });

    act(() => {
      failures[0]?.(new TypeError("Failed to fetch"));
    });

    await waitFor(() => {
      expect(failures).toHaveLength(2);
    });

    act(() => {
      failures[1]?.(new TypeError("Failed to fetch"));
    });

    await waitFor(() => {
      expect(chatAlert).toHaveBeenCalledTimes(2);
    });

    expect(reactionsIn(key)).toEqual([]);
  });

  it("keeps a reaction the socket confirmed before the answer failed", async () => {
    const deferred: { reject?: (error: Error) => void } = {};

    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((_resolve, reject) => {
            deferred.reject = reject;
          }),
      ),
    );

    client.setQueryData<MessageCache>(key, cacheWith([]));

    const { result } = renderHook(() => useToggleReaction(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.toggle({ messageId: MESSAGE_ID, emoji: "👍", add: true });
    });

    await waitFor(() => {
      expect(deferred.reject).toBeDefined();
    });

    act(() => {
      noteReactionConfirmed(MESSAGE_ID, "👍", true);
    });

    act(() => {
      deferred.reject?.(new TypeError("Failed to fetch"));
    });

    await waitFor(() => {
      expect(chatAlert).toHaveBeenCalled();
    });

    expect(reactionsIn(key)).toEqual([{ emoji: "👍", count: 1, me: true }]);
  });

  it("still puts back what the server holds when a single toggle fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          respond(403, { error: { code: "FORBIDDEN", message: "no" } }),
        ),
      ),
    );

    client.setQueryData<MessageCache>(key, cacheWith([]));

    const { result } = renderHook(() => useToggleReaction(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.toggle({ messageId: MESSAGE_ID, emoji: "👍", add: true });
    });

    await waitFor(() => {
      expect(chatAlert).toHaveBeenCalled();
    });

    expect(reactionsIn(key)).toEqual([]);
  });
});
