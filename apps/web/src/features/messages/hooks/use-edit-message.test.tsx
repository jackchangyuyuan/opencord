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

import { useEditMessage } from "./use-edit-message";

const chatAlert = vi.hoisted(() => vi.fn<(title: string) => void>());

vi.mock("@/lib/toast", () => ({ chatAlert }));

const CHANNEL_ID = "55555555-5555-4555-8555-555555555555";
const MESSAGE_ID = "m-1";

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: MESSAGE_ID,
    channelId: CHANNEL_ID,
    authorId: "u-ada",
    content: "before",
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

function entries(): ChatMessage[] {
  return (
    client
      .getQueryData<MessageCache>(channelMessagesQueryKey(CHANNEL_ID))
      ?.pages.flatMap((page: MessagePage) => page.data) ?? []
  );
}

beforeEach(() => {
  chatAlert.mockClear();

  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  client.setQueryData<MessageCache>(channelMessagesQueryKey(CHANNEL_ID), {
    pages: [
      {
        data: [
          { ...message(), reactions: [{ emoji: "👍", count: 1, me: true }] },
        ],
        nextCursor: null,
      },
    ],
    pageParams: [null],
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("editing a message", () => {
  it("shows the new text before the response arrives", async () => {
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

        return respond(
          200,
          message({ content: "after", editedAt: "2026-09-11T10:05:00.000Z" }),
        );
      }),
    );

    const { result } = renderHook(() => useEditMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.edit({ messageId: MESSAGE_ID, content: "after" });
    });

    await waitFor(() => {
      expect(entries()[0]?.content).toBe("after");
    });

    expect(entries()[0]?.editedAt).toBeNull();

    await act(async () => {
      release();
      await held;
    });

    await waitFor(() => {
      expect(entries()[0]?.editedAt).toBe("2026-09-11T10:05:00.000Z");
    });
  });

  it("keeps the server's rewritten copy, and the viewer's own reactions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          respond(
            200,
            message({
              content: "hello <@u-grace>",
              editedAt: "2026-09-11T10:05:00.000Z",
              reactions: [{ emoji: "👍", count: 1, me: false }],
            }),
          ),
        ),
      ),
    );

    const { result } = renderHook(() => useEditMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.edit({ messageId: MESSAGE_ID, content: "hello @grace" });
    });

    await waitFor(() => {
      expect(entries()[0]?.content).toBe("hello <@u-grace>");
    });

    expect(entries()[0]?.reactions).toEqual([
      { emoji: "👍", count: 1, me: true },
    ]);
  });

  it("puts the old text back when the edit is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          respond(403, {
            error: {
              code: "NOT_THE_AUTHOR",
              message: "Only the author may edit a message",
            },
          }),
        ),
      ),
    );

    const { result } = renderHook(() => useEditMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.edit({ messageId: MESSAGE_ID, content: "after" });
    });

    await waitFor(() => {
      expect(chatAlert).toHaveBeenCalledWith(
        "Only the author may edit a message",
      );
    });

    expect(entries()[0]?.content).toBe("before");
  });

  it("undoes only its own text when the edit is refused", async () => {
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

        return respond(500, {
          error: { code: "INTERNAL", message: "Internal server error" },
        });
      }),
    );

    const { result } = renderHook(() => useEditMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.edit({ messageId: MESSAGE_ID, content: "after" });
    });

    await waitFor(() => {
      expect(entries()[0]?.content).toBe("after");
    });

    act(() => {
      client.setQueryData<MessageCache>(
        channelMessagesQueryKey(CHANNEL_ID),
        (cache) =>
          cache === undefined
            ? cache
            : {
                ...cache,
                pages: [
                  {
                    ...cache.pages[0],
                    data: [
                      message({ id: "m-2", content: "arrived meanwhile" }),
                      ...(cache.pages[0]?.data ?? []),
                    ],
                    nextCursor: null,
                  },
                ],
              },
      );
    });

    await act(async () => {
      release();
      await held;
    });

    await waitFor(() => {
      expect(entries().find((entry) => entry.id === MESSAGE_ID)?.content).toBe(
        "before",
      );
    });

    expect(entries().map((entry) => entry.id)).toContain("m-2");
  });

  it("does not put a deleted message back when a late edit succeeds", async () => {
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

        return respond(
          200,
          message({ content: "after", editedAt: "2026-09-11T10:05:00.000Z" }),
        );
      }),
    );

    const { result } = renderHook(() => useEditMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.edit({ messageId: MESSAGE_ID, content: "after" });
    });

    act(() => {
      client.setQueryData<MessageCache>(
        channelMessagesQueryKey(CHANNEL_ID),
        (cache) =>
          applyMessageEvent(cache, {
            type: "delete",
            payload: {
              channelId: CHANNEL_ID,
              messageId: MESSAGE_ID,
              deletedAt: "2026-09-11T10:04:00.000Z",
            },
          }),
      );
    });

    await act(async () => {
      release();
      await held;
    });

    expect(entries()[0]?.deletedAt).toBe("2026-09-11T10:04:00.000Z");
    expect(entries()[0]?.content).toBe("");
  });

  it("explains an empty edit of a message with no image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          respond(400, {
            error: {
              code: "CONTENT_REQUIRED",
              message:
                "Only a message carrying an attachment may have empty content",
            },
          }),
        ),
      ),
    );

    const { result } = renderHook(() => useEditMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.edit({ messageId: MESSAGE_ID, content: "" });
    });

    await waitFor(() => {
      expect(chatAlert).toHaveBeenCalledWith(
        "A message without an image needs some text",
      );
    });
  });
  it("edits inside an open jump window, and rolls that back too", async () => {
    const aroundKey = channelMessagesAroundQueryKey(CHANNEL_ID, MESSAGE_ID);

    client.setQueryData<MessageCache>(aroundKey, {
      pages: [{ data: [message()], nextCursor: null }],
      pageParams: [null],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          respond(403, {
            error: { code: "NOT_THE_AUTHOR", message: "Not the author" },
          }),
        ),
      ),
    );

    const { result } = renderHook(() => useEditMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.edit({ messageId: MESSAGE_ID, content: "after" });
    });

    expect(
      client.getQueryData<MessageCache>(aroundKey)?.pages[0]?.data[0]?.content,
    ).toBe("after");

    await waitFor(() => {
      expect(chatAlert).toHaveBeenCalled();
    });

    expect(
      client.getQueryData<MessageCache>(aroundKey)?.pages[0]?.data[0]?.content,
    ).toBe("before");
  });

  it("rolls two failed edits back to the text the server holds", async () => {
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

    const { result } = renderHook(() => useEditMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.edit({ messageId: MESSAGE_ID, content: "first attempt" });
    });

    expect(entries()[0]?.content).toBe("first attempt");

    act(() => {
      result.current.edit({ messageId: MESSAGE_ID, content: "second attempt" });
    });

    expect(entries()[0]?.content).toBe("second attempt");

    await waitFor(() => {
      expect(failures).toHaveLength(1);
    });

    act(() => {
      failures[0]?.(new TypeError("Failed to fetch"));
    });

    await waitFor(() => {
      expect(chatAlert).toHaveBeenCalledTimes(1);
    });

    expect(entries()[0]?.content).toBe("second attempt");

    await waitFor(() => {
      expect(failures).toHaveLength(2);
    });

    act(() => {
      failures[1]?.(new TypeError("Failed to fetch"));
    });

    await waitFor(() => {
      expect(entries()[0]?.content).toBe("before");
    });
  });

  it("does not overwrite a later edit with an earlier answer", async () => {
    const settlers: {
      resolve?: (value: Response) => void;
      reject?: (error: Error) => void;
    }[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve, reject) => {
            settlers.push({ resolve, reject });
          }),
      ),
    );

    const { result } = renderHook(() => useEditMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.edit({ messageId: MESSAGE_ID, content: "first attempt" });
    });

    act(() => {
      result.current.edit({ messageId: MESSAGE_ID, content: "second attempt" });
    });

    await waitFor(() => {
      expect(settlers).toHaveLength(1);
    });

    act(() => {
      settlers[0]?.resolve?.(
        respond(200, {
          ...message(),
          content: "first attempt <@u-grace>",
          editedAt: "2026-09-11T11:00:00.000Z",
        }),
      );
    });

    await waitFor(() => {
      expect(settlers).toHaveLength(2);
    });

    expect(entries()[0]?.content).toBe("second attempt");

    act(() => {
      settlers[1]?.reject?.(new TypeError("Failed to fetch"));
    });

    await waitFor(() => {
      expect(entries()[0]?.content).toBe("first attempt <@u-grace>");
    });
  });
});
