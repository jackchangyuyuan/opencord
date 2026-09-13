import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ChannelListEntry,
  serverChannelsQueryKey,
} from "@/features/channels/api/queries";

import { useReorderChannels } from "./use-reorder-channels";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";

function channel(id: string, name: string, position: number): ChannelListEntry {
  return {
    id,
    serverId: SERVER_ID,
    type: "text",
    name,
    topic: null,
    position,
    lastMessageId: null,
    lastEveryoneMentionId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    lastReadMessageId: null,
    hasUnread: false,
    hasEveryone: false,
    mentionCount: 0,
    unreadCount: 0,
  };
}

const CHANNELS = [
  channel("c-a", "alpha", 0),
  channel("c-b", "bravo", 1),
  channel("c-c", "charlie", 2),
];

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function names(): (string | null)[] {
  return (
    client
      .getQueryData<ChannelListEntry[]>(serverChannelsQueryKey(SERVER_ID))
      ?.map((entry) => entry.name) ?? []
  );
}

function stubFetch(status: number) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(status === 200 ? { channels: [] } : {}), {
        status,
        headers: { "content-type": "application/json" },
      }),
    ),
  );

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  client.setQueryData(serverChannelsQueryKey(SERVER_ID), CHANNELS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useReorderChannels", () => {
  it("moves the rows before the request goes out", async () => {
    stubFetch(200);

    const { result } = renderHook(() => useReorderChannels(SERVER_ID), {
      wrapper,
    });

    act(() => {
      result.current.reorder(["c-c", "c-a", "c-b"]);
    });

    await waitFor(() => {
      expect(names()).toEqual(["charlie", "alpha", "bravo"]);
    });
  });

  it("sends the whole order to the positions endpoint", async () => {
    const fetchMock = stubFetch(200);

    const { result } = renderHook(() => useReorderChannels(SERVER_ID), {
      wrapper,
    });

    act(() => {
      result.current.reorder(["c-b", "c-a", "c-c"]);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/servers/${SERVER_ID}/channels/positions`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ channelIds: ["c-b", "c-a", "c-c"] }),
        }),
      );
    });
  });

  it("puts the rows back when the server refuses", async () => {
    stubFetch(403);

    const { result } = renderHook(() => useReorderChannels(SERVER_ID), {
      wrapper,
    });

    act(() => {
      result.current.reorder(["c-c", "c-b", "c-a"]);
    });

    await waitFor(() => {
      expect(names()).toEqual(["alpha", "bravo", "charlie"]);
    });
  });

  it("leaves a channel that was not part of the order alone", async () => {
    stubFetch(200);
    client.setQueryData(serverChannelsQueryKey(SERVER_ID), [
      ...CHANNELS,
      channel("c-hidden", "hidden", 3),
    ]);

    const { result } = renderHook(() => useReorderChannels(SERVER_ID), {
      wrapper,
    });

    act(() => {
      result.current.reorder(["c-c", "c-b", "c-a"]);
    });

    await waitFor(() => {
      expect(names()).toEqual(["charlie", "bravo", "alpha", "hidden"]);
    });
  });
});
