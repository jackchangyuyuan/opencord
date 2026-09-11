import type { Message } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MessageCache } from "@/features/messages/api/queries";
import {
  channelMessagesAroundQueryKey,
  channelMessagesQueryKey,
  type MessagePage,
} from "@/features/messages/api/queries";
import type { ChatMessage } from "@/features/messages/lib/cache";
import { applyMessageEvent } from "@/features/realtime/lib/apply-message-event";

import { useDeleteMessage } from "./use-delete-message";

const chatAlert = vi.hoisted(() => vi.fn<(title: string) => void>());

vi.mock("@/lib/toast", () => ({ chatAlert }));

const CHANNEL_ID = "44444444-4444-4444-8444-444444444444";
const MESSAGE_ID = "m-1";

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: MESSAGE_ID,
    channelId: CHANNEL_ID,
    authorId: "u-ada",
    content: "regrettable",
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

function seeded(): MessageCache {
  return {
    pages: [{ data: [message()], nextCursor: null }],
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

function entries(key: readonly unknown[]): ChatMessage[] {
  return (
    client
      .getQueryData<MessageCache>(key)
      ?.pages.flatMap((page: MessagePage) => page.data) ?? []
  );
}

beforeEach(() => {
  chatAlert.mockClear();

  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  client.setQueryData<MessageCache>(
    channelMessagesQueryKey(CHANNEL_ID),
    seeded(),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("deleting a message", () => {
  it("tombstones the row rather than removing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          respond(200, {
            channelId: CHANNEL_ID,
            messageId: MESSAGE_ID,
            deletedAt: "2026-09-11T11:00:00.000Z",
          }),
        ),
      ),
    );

    const { result } = renderHook(() => useDeleteMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.remove(MESSAGE_ID);
    });

    expect(entries(channelMessagesQueryKey(CHANNEL_ID))).toHaveLength(1);
    expect(entries(channelMessagesQueryKey(CHANNEL_ID))[0]?.content).toBe("");

    await waitFor(() => {
      expect(entries(channelMessagesQueryKey(CHANNEL_ID))[0]?.deletedAt).toBe(
        "2026-09-11T11:00:00.000Z",
      );
    });
  });

  it("keeps the tombstone when a late update arrives for it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          respond(200, {
            channelId: CHANNEL_ID,
            messageId: MESSAGE_ID,
            deletedAt: "2026-09-11T11:00:00.000Z",
          }),
        ),
      ),
    );

    const { result } = renderHook(() => useDeleteMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.remove(MESSAGE_ID);
    });

    await waitFor(() => {
      expect(entries(channelMessagesQueryKey(CHANNEL_ID))[0]?.deletedAt).toBe(
        "2026-09-11T11:00:00.000Z",
      );
    });

    const next = applyMessageEvent(
      client.getQueryData<MessageCache>(channelMessagesQueryKey(CHANNEL_ID)),
      { type: "update", message: message({ content: "back from the dead" }) },
    );

    expect(next?.pages[0]?.data[0]?.content).toBe("");
  });

  it("puts the message back when the server refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          respond(403, {
            error: { code: "FORBIDDEN", message: "Forbidden" },
          }),
        ),
      ),
    );

    const { result } = renderHook(() => useDeleteMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.remove(MESSAGE_ID);
    });

    await waitFor(() => {
      expect(chatAlert).toHaveBeenCalledWith("You cannot delete this message");
    });

    expect(
      entries(channelMessagesQueryKey(CHANNEL_ID))[0]?.deletedAt,
    ).toBeNull();
    expect(entries(channelMessagesQueryKey(CHANNEL_ID))[0]?.content).toBe(
      "regrettable",
    );
  });

  it("undoes only its own tombstone when the delete is refused", async () => {
    let release!: () => void;

    const held = new Promise<void>((resolve) => {
      release = () => {
        resolve();
      };
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await held;

        return respond(403, {
          error: { code: "FORBIDDEN", message: "Forbidden" },
        });
      }),
    );

    const { result } = renderHook(() => useDeleteMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.remove(MESSAGE_ID);
    });

    act(() => {
      client.setQueryData<MessageCache>(
        channelMessagesQueryKey(CHANNEL_ID),
        (cache) =>
          applyMessageEvent(cache, {
            type: "reaction",
            add: true,
            payload: {
              channelId: CHANNEL_ID,
              messageId: MESSAGE_ID,
              userId: "u-grace",
              emoji: "\u{1F44D}",
            },
            viewerId: "u-ada",
          }),
      );
    });

    await act(async () => {
      release();
      await held;
    });

    await waitFor(() => {
      expect(chatAlert).toHaveBeenCalledWith("You cannot delete this message");
    });

    const [restored] = entries(channelMessagesQueryKey(CHANNEL_ID));

    expect(restored?.deletedAt).toBeNull();
    expect(restored?.content).toBe("regrettable");
    expect(restored?.reactions).toEqual([
      { emoji: "\u{1F44D}", count: 1, me: false },
    ]);
  });

  it("tombstones an open jump window too", async () => {
    const aroundKey = channelMessagesAroundQueryKey(CHANNEL_ID, MESSAGE_ID);

    client.setQueryData<MessageCache>(aroundKey, seeded());

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          respond(200, {
            channelId: CHANNEL_ID,
            messageId: MESSAGE_ID,
            deletedAt: "2026-09-11T11:00:00.000Z",
          }),
        ),
      ),
    );

    const { result } = renderHook(() => useDeleteMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.remove(MESSAGE_ID);
    });

    expect(entries(aroundKey)[0]?.content).toBe("");

    await waitFor(() => {
      expect(entries(aroundKey)[0]?.deletedAt).toBe("2026-09-11T11:00:00.000Z");
    });
  });
});
