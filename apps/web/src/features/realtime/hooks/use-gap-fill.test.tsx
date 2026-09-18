import type { Message } from "@opencord/shared/types";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MessageCache } from "@/features/messages/api/queries";
import {
  channelMessagesAroundQueryKey,
  channelMessagesQueryKey,
  channelPinsQueryKey,
  encodeCursor,
  MESSAGE_PAGE_SIZE,
} from "@/features/messages/api/queries";
import { api } from "@/lib/api-client";

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

    rawEmit: (event: string) => {
      for (const listener of [...(listeners.get(event) ?? [])]) {
        listener();
      }
    },

    reset: () => {
      listeners.clear();
    },
  };
});

vi.mock("@/lib/socket", () => ({ socket }));

const { GAP_FILL_INTERVAL_MS, RECOVERY_OVERLAP, useGapFill } =
  await import("./use-gap-fill");

const CHANNEL_ID = "88888888-8888-4888-8888-888888888888";
const OTHER_CHANNEL_ID = "99999999-9999-4999-8999-999999999999";

function run(id: number): string {
  return `m-${String(id).padStart(3, "0")}`;
}

function message(id: string, content: string): Message {
  return {
    id,
    channelId: CHANNEL_ID,
    authorId: "u-ada",
    content,
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
  };
}

function seed(client: QueryClient, channelId: string, entries: Message[]) {
  client.setQueryData<MessageCache>(channelMessagesQueryKey(channelId), {
    pages: [{ data: entries, nextCursor: null }],
    pageParams: [null],
  });
}

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function entries(channelId = CHANNEL_ID) {
  return (
    client
      .getQueryData<MessageCache>(channelMessagesQueryKey(channelId))
      ?.pages.flatMap((page) => page.data) ?? []
  );
}

function stubFetch(page: { data: Message[]; nextCursor: string | null }) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function watchMessages(channelId: string): () => void {
  const observer = new QueryObserver(client, {
    queryKey: channelMessagesQueryKey(channelId),
    queryFn: () =>
      api<unknown>(
        `/channels/${channelId}/messages?limit=${String(MESSAGE_PAGE_SIZE)}`,
      ),
  });

  return observer.subscribe(() => undefined);
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

beforeEach(() => {
  reset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  setVisibility("visible");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useGapFill", () => {
  it("asks for everything after the newest message it already holds", async () => {
    seed(client, CHANNEL_ID, [message("m-1", "first")]);

    const fetchMock = stubFetch({
      data: [message("m-2", "missed")],
      nextCursor: null,
    });

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(entries().map((entry) => entry.id)).toEqual(["m-2", "m-1"]);
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/channels/${CHANNEL_ID}/messages?after=${encodeCursor("m-1")}&limit=${String(MESSAGE_PAGE_SIZE)}`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("keeps asking until the whole gap is closed", async () => {
    seed(client, CHANNEL_ID, [message("m-1", "first")]);

    const pages = [
      {
        data: [message("m-2", "two"), message("m-3", "three")],
        nextCursor: "c",
      },
      { data: [message("m-4", "four")], nextCursor: null },
    ];

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => {
      const page = pages.shift();

      return Promise.resolve(
        new Response(JSON.stringify(page ?? { data: [], nextCursor: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(entries().map((entry) => entry.id)).toEqual([
        "m-4",
        "m-3",
        "m-2",
        "m-1",
      ]);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `/api/v1/channels/${CHANNEL_ID}/messages?after=${encodeCursor("m-1")}&limit=${String(MESSAGE_PAGE_SIZE)}`,
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/v1/channels/${CHANNEL_ID}/messages?after=${encodeCursor("m-3")}&limit=${String(MESSAGE_PAGE_SIZE)}`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("stops asking when a page reports no continuation", async () => {
    seed(client, CHANNEL_ID, [message("m-1", "first")]);

    const fetchMock = stubFetch({
      data: [message("m-2", "two")],
      nextCursor: null,
    });

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(entries()).toHaveLength(2);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("produces no duplicate when the socket echo already applied the message", async () => {
    seed(client, CHANNEL_ID, [
      message("m-2", "missed"),
      message("m-1", "first"),
    ]);

    stubFetch({ data: [message("m-2", "missed")], nextCursor: null });

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(entries()).toHaveLength(2);
    });
  });

  it("fills every open channel when the socket reconnects", async () => {
    seed(client, CHANNEL_ID, [message("m-1", "first")]);
    seed(client, OTHER_CHANNEL_ID, [message("n-1", "other")]);

    const fetchMock = stubFetch({ data: [], nextCursor: null });

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    act(() => {
      rawEmit("connect");
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it("fills only the active channel on a visibility change", async () => {
    seed(client, CHANNEL_ID, [message("m-1", "first")]);
    seed(client, OTHER_CHANNEL_ID, [message("n-1", "other")]);

    const fetchMock = stubFetch({ data: [], nextCursor: null });

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("ticks every 60 s while the tab is visible, and stops when it is not", async () => {
    vi.useFakeTimers();

    seed(client, CHANNEL_ID, [message("m-1", "first")]);

    const fetchMock = stubFetch({ data: [], nextCursor: null });

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(GAP_FILL_INTERVAL_MS);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    setVisibility("hidden");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(GAP_FILL_INTERVAL_MS);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recovers a message missed in the middle of the history", async () => {
    const history = Array.from({ length: RECOVERY_OVERLAP + 5 }, (_, at) =>
      run(at + 1),
    );
    const missed = history[history.length - 3] ?? "";
    const cached = history.filter((id) => id !== missed);

    seed(client, CHANNEL_ID, cached.map((id) => message(id, id)).reverse());

    const from = cached.at(-1 - RECOVERY_OVERLAP) ?? "";

    const fetchMock = stubFetch({
      data: history.filter((id) => id > from).map((id) => message(id, id)),
      nextCursor: null,
    });

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(entries().map((entry) => entry.id)).toContain(missed);
    });

    expect(entries().map((entry) => entry.id)).toEqual([...history].reverse());

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/channels/${CHANNEL_ID}/messages?after=${encodeCursor(from)}&limit=${String(MESSAGE_PAGE_SIZE)}`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("picks up an edit and a reaction made while the connection was down", async () => {
    seed(client, CHANNEL_ID, [
      message(run(2), "before"),
      message(run(1), "first"),
    ]);

    stubFetch({
      data: [
        {
          ...message(run(2), "after"),
          editedAt: "2026-09-11T11:00:00.000Z",
          reactions: [{ emoji: "\u{1F44D}", count: 1, me: true }],
        },
      ],
      nextCursor: null,
    });

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(entries()[0]?.content).toBe("after");
    });

    expect(entries()[0]?.reactions).toEqual([
      { emoji: "\u{1F44D}", count: 1, me: true },
    ]);
  });

  it("tombstones a message deleted while the connection was down", async () => {
    seed(client, CHANNEL_ID, [
      message(run(3), "third"),
      message(run(2), "second"),
      message(run(1), "first"),
    ]);

    stubFetch({ data: [message(run(3), "third")], nextCursor: null });

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(
        entries().find((entry) => entry.id === run(2))?.deletedAt,
      ).not.toBeNull();
    });

    expect(entries().find((entry) => entry.id === run(2))?.content).toBe("");
    expect(
      entries().find((entry) => entry.id === run(1))?.deletedAt,
    ).toBeNull();
    expect(
      entries().find((entry) => entry.id === run(3))?.deletedAt,
    ).toBeNull();
  });

  it("tombstones the newest message when that is the one that was deleted", async () => {
    seed(client, CHANNEL_ID, [
      message(run(3), "third"),
      message(run(2), "second"),
      message(run(1), "first"),
    ]);

    stubFetch({ data: [message(run(2), "second")], nextCursor: null });

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(
        entries().find((entry) => entry.id === run(3))?.deletedAt,
      ).not.toBeNull();
    });

    expect(
      entries().find((entry) => entry.id === run(2))?.deletedAt,
    ).toBeNull();
  });

  it("re-reads a channel whose cache has nothing to anchor on", async () => {
    const observed = watchMessages(CHANNEL_ID);
    const fetchMock = stubFetch({ data: [], nextCursor: null });

    client.setQueryData<MessageCache>(channelMessagesQueryKey(CHANNEL_ID), {
      pages: [{ data: [], nextCursor: null }],
      pageParams: [null],
    });

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          urlOf(url).includes(`/channels/${CHANNEL_ID}/messages?limit=`),
        ),
      ).toBe(true);
    });

    observed();
  });

  it("re-reads a channel holding a single message, which no window reaches", async () => {
    const observed = watchMessages(CHANNEL_ID);
    const fetchMock = stubFetch({ data: [], nextCursor: null });

    seed(client, CHANNEL_ID, [message(run(1), "only")]);

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          urlOf(url).includes(`/channels/${CHANNEL_ID}/messages?limit=`),
        ),
      ).toBe(true);
    });

    observed();
  });

  it("reads forward rather than re-reading a history long enough to anchor", async () => {
    const observed = watchMessages(CHANNEL_ID);
    const history = Array.from({ length: RECOVERY_OVERLAP + 5 }, (_, at) =>
      run(at + 1),
    );
    const from = history.at(-1 - RECOVERY_OVERLAP) ?? "";

    seed(client, CHANNEL_ID, history.map((id) => message(id, id)).reverse());

    const fetchMock = stubFetch({
      data: history.filter((id) => id > from).map((id) => message(id, id)),
      nextCursor: null,
    });

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    expect(
      fetchMock.mock.calls.every(([url]) => urlOf(url).includes("after=")),
    ).toBe(true);

    observed();
  });

  it("re-reads the historical windows and the pinned list on a reconnect", async () => {
    seed(client, CHANNEL_ID, [message(run(1), "first")]);

    const aroundKey = channelMessagesAroundQueryKey(CHANNEL_ID, run(1));
    const pinsKey = channelPinsQueryKey(CHANNEL_ID);

    client.setQueryData<MessageCache>(aroundKey, {
      pages: [{ data: [message(run(1), "first")], nextCursor: null }],
      pageParams: [null],
    });
    client.setQueryData(pinsKey, []);

    stubFetch({ data: [], nextCursor: null });

    renderHook(
      () => {
        useGapFill(CHANNEL_ID);
      },
      { wrapper },
    );

    act(() => {
      rawEmit("connect");
    });

    await waitFor(() => {
      expect(client.getQueryState(aroundKey)?.isInvalidated).toBe(true);
      expect(client.getQueryState(pinsKey)?.isInvalidated).toBe(true);
    });
  });
});
