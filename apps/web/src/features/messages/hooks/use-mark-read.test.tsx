import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ChannelListEntry,
  serverChannelsQueryKey,
} from "@/features/channels/api/queries";

const { rawEmit, reset, socket } = vi.hoisted(() => {
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
    },

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

const { MARK_READ_DELAY_MS, useMarkRead } = await import("./use-mark-read");

const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const CHANNEL_ID = "88888888-8888-4888-8888-888888888888";
const OTHER_CHANNEL_ID = "99999999-9999-4999-8999-999999999999";

function entry(overrides: Partial<ChannelListEntry>): ChannelListEntry {
  return {
    id: CHANNEL_ID,
    serverId: SERVER_ID,
    type: "text",
    name: "general",
    topic: null,
    position: 0,
    lastMessageId: null,
    lastEveryoneMentionId: null,
    createdAt: "2026-09-11T10:00:00.000Z",
    lastReadMessageId: null,
    hasUnread: false,
    hasEveryone: false,
    mentionCount: 0,
    ...overrides,
  };
}

let client: QueryClient;
let fetchMock: ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function seed(entries: ChannelListEntry[]) {
  client.setQueryData<ChannelListEntry[]>(
    serverChannelsQueryKey(SERVER_ID),
    entries,
  );
}

function readCalls(): { url: string; messageId: string }[] {
  return fetchMock.mock.calls.map((call) => {
    const [url, init] = call as [string, { body: string }];
    const body = JSON.parse(init.body) as { messageId: string };

    return { url, messageId: body.messageId };
  });
}

beforeEach(() => {
  reset();
  vi.useFakeTimers();

  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useMarkRead", () => {
  it("debounces the mark-read into one request", async () => {
    seed([entry({ hasUnread: true, lastMessageId: "m-3" })]);

    const { result } = renderHook(() => useMarkRead(CHANNEL_ID), { wrapper });

    act(() => {
      result.current.markRead("m-1");
      result.current.markRead("m-2");
      result.current.markRead("m-3");
    });

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MARK_READ_DELAY_MS);
    });

    expect(readCalls()).toEqual([
      { url: `/api/v1/channels/${CHANNEL_ID}/read`, messageId: "m-3" },
    ]);
  });

  it("never sends a watermark that moves backwards", async () => {
    seed([entry({ hasUnread: true })]);

    const { result } = renderHook(() => useMarkRead(CHANNEL_ID), { wrapper });

    act(() => {
      result.current.markRead("m-9");
      result.current.markRead("m-2");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MARK_READ_DELAY_MS);
    });

    expect(readCalls()).toEqual([
      { url: `/api/v1/channels/${CHANNEL_ID}/read`, messageId: "m-9" },
    ]);
  });

  it("ignores an optimistic message that has no server id yet", () => {
    seed([entry({ hasUnread: true })]);

    const { result } = renderHook(() => useMarkRead(CHANNEL_ID), { wrapper });

    act(() => {
      result.current.markRead("optimistic:abc");
      vi.advanceTimersByTime(MARK_READ_DELAY_MS);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("captures the divider before the mark-read fires", async () => {
    seed([entry({ hasUnread: true, lastReadMessageId: "m-4" })]);

    const { result } = renderHook(() => useMarkRead(CHANNEL_ID), { wrapper });

    expect(result.current.dividerAfterMessageId).toBe("m-4");

    await act(async () => {
      result.current.markRead("m-9");
      await vi.advanceTimersByTimeAsync(MARK_READ_DELAY_MS);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.current.dividerAfterMessageId).toBe("m-4");
  });

  it("shows no divider for a channel with nothing unread", () => {
    seed([entry({ hasUnread: false, lastReadMessageId: "m-4" })]);

    const { result } = renderHook(() => useMarkRead(CHANNEL_ID), { wrapper });

    expect(result.current.dividerAfterMessageId).toBeNull();
  });

  it("leaves the divider null for a channel that was never read", () => {
    seed([entry({ hasUnread: true, lastReadMessageId: null })]);

    const { result } = renderHook(() => useMarkRead(CHANNEL_ID), { wrapper });

    expect(result.current.dividerAfterMessageId).toBeNull();
  });

  it("flushes the pending read against the channel it was read in", async () => {
    seed([
      entry({ hasUnread: true, lastReadMessageId: "m-1" }),
      entry({
        id: OTHER_CHANNEL_ID,
        name: "other",
        hasUnread: true,
        lastReadMessageId: "m-7",
      }),
    ]);

    const { rerender, result } = renderHook(
      ({ channelId }: { channelId: string }) => useMarkRead(channelId),
      { initialProps: { channelId: CHANNEL_ID }, wrapper },
    );

    act(() => {
      result.current.markRead("m-5");
    });

    rerender({ channelId: OTHER_CHANNEL_ID });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(readCalls()).toEqual([
      { url: `/api/v1/channels/${CHANNEL_ID}/read`, messageId: "m-5" },
    ]);
    expect(result.current.dividerAfterMessageId).toBe("m-7");
  });

  it("moves the badge on read:update but leaves the divider alone", async () => {
    seed([entry({ hasUnread: true, lastReadMessageId: "m-4" })]);

    const invalidate = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useMarkRead(CHANNEL_ID), { wrapper });

    await act(async () => {
      rawEmit("read:update", {
        channelId: CHANNEL_ID,
        lastReadMessageId: "m-9",
        mentionCount: 0,
      });
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(invalidate).toHaveBeenCalled();
    expect(result.current.dividerAfterMessageId).toBe("m-4");
  });

  it("flushes a pending read when the tab is hidden", async () => {
    seed([entry({ hasUnread: true })]);

    const { result } = renderHook(() => useMarkRead(CHANNEL_ID), { wrapper });

    await act(async () => {
      result.current.markRead("m-6");
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(readCalls()).toEqual([
      { url: `/api/v1/channels/${CHANNEL_ID}/read`, messageId: "m-6" },
    ]);
  });

  it("does nothing without a channel", () => {
    const { result } = renderHook(() => useMarkRead(undefined), { wrapper });

    act(() => {
      result.current.markRead("m-1");
      vi.advanceTimersByTime(MARK_READ_DELAY_MS);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.dividerAfterMessageId).toBeNull();
  });
});
