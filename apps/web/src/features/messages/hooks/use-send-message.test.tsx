import type { Message } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  channelMessagesQueryKey,
  type MessageCache,
  type MessagePage,
} from "@/features/messages/api/queries";
import { applyIncoming, type ChatMessage } from "@/features/messages/lib/cache";
import { rowKey } from "@/features/messages/lib/rows";
import { endAccountScope } from "@/lib/account-scope";
import { useDrafts } from "@/stores/drafts";

import { useSendMessage } from "./use-send-message";

const CHANNEL_ID = "55555555-5555-4555-8555-555555555555";
const AUTHOR_ID = "u-ada";
const NONCE = "nonce-1";

function serverMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m-server",
    channelId: CHANNEL_ID,
    authorId: AUTHOR_ID,
    content: "hello",
    nonce: NONCE,
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

function bodyOf(init: RequestInit | undefined): string {
  return typeof init?.body === "string" ? init.body : "{}";
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

function cache(): MessageCache | undefined {
  return client.getQueryData<MessageCache>(channelMessagesQueryKey(CHANNEL_ID));
}

function entries(): ChatMessage[] {
  return cache()?.pages.flatMap((page: MessagePage) => page.data) ?? [];
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useDrafts.setState({ byChannel: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("applyIncoming", () => {
  it("replaces the optimistic entry carrying the same nonce", () => {
    const optimistic: ChatMessage = {
      ...serverMessage({ id: `optimistic:${NONCE}` }),
      local: {
        status: "sending",
        retry: "same-nonce",
        reason: null,
        source: "",
        attachments: [],
      },
    };

    const seeded: MessageCache = {
      pages: [{ data: [optimistic], nextCursor: null }],
      pageParams: [null],
    };

    const applied = applyIncoming(seeded, serverMessage());

    expect(applied.pages[0]?.data).toHaveLength(1);
    expect(applied.pages[0]?.data[0]?.id).toBe("m-server");
  });

  it("applies a second delivery of the same message exactly once", () => {
    const first = applyIncoming(undefined, serverMessage());
    const second = applyIncoming(first, serverMessage());

    expect(second.pages.flatMap((page) => page.data)).toHaveLength(1);
  });

  it("inserts a message it has never seen in id order", () => {
    const applied = applyIncoming(
      applyIncoming(
        applyIncoming(undefined, serverMessage({ id: "m-2", nonce: null })),
        serverMessage({ id: "m-4", nonce: null }),
      ),
      serverMessage({ id: "m-3", nonce: null }),
    );

    expect(applied.pages[0]?.data.map((entry) => entry.id)).toEqual([
      "m-4",
      "m-3",
      "m-2",
    ]);
  });

  it("keeps an unsent message ahead of everything the server has answered for", () => {
    const applied = applyIncoming(
      { pages: [{ data: [], nextCursor: null }], pageParams: [null] },
      serverMessage({ id: "m-9", nonce: null }),
    );

    const withOptimistic = applyIncoming(applied, {
      ...serverMessage({ id: "optimistic:n-1", nonce: "n-1" }),
    });

    expect(withOptimistic.pages[0]?.data.map((entry) => entry.id)).toEqual([
      "optimistic:n-1",
      "m-9",
    ]);
  });
});

describe("useSendMessage", () => {
  it("shows the message immediately and replaces it once with the server's", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(respond(201, serverMessage())),
    );

    const { result } = renderHook(() => useSendMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.send({
        content: "hello",
        nonce: NONCE,
        authorId: AUTHOR_ID,
      });
    });

    expect(entries()).toHaveLength(1);
    expect(entries()[0]?.local?.status).toBe("sending");

    await waitFor(() => {
      expect(entries()[0]?.id).toBe("m-server");
    });

    expect(entries()).toHaveLength(1);
    expect(entries()[0]?.local).toBeUndefined();

    act(() => {
      client.setQueryData<MessageCache>(
        channelMessagesQueryKey(CHANNEL_ID),
        (current) => applyIncoming(current, serverMessage()),
      );
    });

    expect(entries()).toHaveLength(1);
  });

  it("echoes a reply with the quoted line it will be confirmed with", async () => {
    const replyTo = {
      id: "m-answered",
      authorId: "u-linus",
      content: "the deploy is green",
      deletedAt: null,
    };

    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          respond(
            201,
            serverMessage({ replyToId: replyTo.id, replyTo, content: "nice" }),
          ),
        ),
    );

    const { result } = renderHook(() => useSendMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.send({
        content: "nice",
        nonce: NONCE,
        authorId: AUTHOR_ID,
        replyToId: replyTo.id,
        replyTo,
      });
    });

    expect(entries()[0]?.replyTo).toEqual(replyTo);
    expect(entries()[0]?.replyToId).toBe(replyTo.id);

    await waitFor(() => {
      expect(entries()[0]?.id).toBe("m-server");
    });

    expect(entries()[0]?.replyTo).toEqual(replyTo);
  });

  it("keeps the quoted line when a failed reply is retried", async () => {
    const replyTo = {
      id: "m-answered",
      authorId: "u-linus",
      content: "the deploy is green",
      deletedAt: null,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(respond(500, { error: {} })),
    );

    const { result } = renderHook(() => useSendMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.send({
        content: "nice",
        nonce: NONCE,
        authorId: AUTHOR_ID,
        replyToId: replyTo.id,
        replyTo,
      });
    });

    await waitFor(() => {
      expect(entries()[0]?.local?.status).toBe("failed");
    });

    const [failed] = entries();

    if (failed === undefined) {
      throw new Error("the failed row is what this test is about");
    }

    act(() => {
      result.current.retry(failed, AUTHOR_ID);
    });

    expect(entries()[0]?.replyTo).toEqual(replyTo);
  });

  it("re-posts the attachments of a failed send", async () => {
    const attachments = [
      {
        objectKey: "attachments/u-ada/shot.png",
        filename: "shot.png",
        width: 800,
        height: 600,
      },
    ];

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        respond(500, {
          error: { code: "INTERNAL", message: "Internal server error" },
        }),
      )
      .mockResolvedValueOnce(respond(201, serverMessage()));

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSendMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.send({
        content: "look at this",
        nonce: NONCE,
        authorId: AUTHOR_ID,
        attachments,
      });
    });

    await waitFor(() => {
      expect(entries()[0]?.local?.status).toBe("failed");
    });

    const failed = entries()[0];

    if (failed === undefined) {
      throw new Error("the failed row is what this test is about");
    }

    act(() => {
      result.current.retry(failed, AUTHOR_ID);
    });

    await waitFor(() => {
      expect(entries()[0]?.id).toBe("m-server");
    });

    const bodies = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(bodyOf(init)) as unknown,
    );

    expect(bodies).toEqual([
      { content: "look at this", nonce: NONCE, attachments },
      { content: "look at this", nonce: NONCE, attachments },
    ]);
  });

  it("re-posts a message that was only its attachment", async () => {
    const attachments = [
      { objectKey: "attachments/u-ada/only.png", filename: "only.png" },
    ];

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        respond(503, {
          error: { code: "INTERNAL", message: "Service unavailable" },
        }),
      )
      .mockResolvedValueOnce(respond(201, serverMessage({ content: "" })));

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSendMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.send({
        content: "",
        nonce: NONCE,
        authorId: AUTHOR_ID,
        attachments,
      });
    });

    await waitFor(() => {
      expect(entries()[0]?.local?.status).toBe("failed");
    });

    const failed = entries()[0];

    if (failed === undefined) {
      throw new Error("the failed row is what this test is about");
    }

    act(() => {
      result.current.retry(failed, AUTHOR_ID);
    });

    await waitFor(() => {
      expect(entries()[0]?.id).toBe("m-server");
    });

    expect(JSON.parse(bodyOf(fetchMock.mock.calls[1]?.[1]))).toEqual({
      content: "",
      nonce: NONCE,
      attachments,
    });
  });

  it("keeps two authors' messages apart when they share a nonce", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(respond(201, serverMessage())),
    );

    const { result } = renderHook(() => useSendMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      client.setQueryData<MessageCache>(
        channelMessagesQueryKey(CHANNEL_ID),
        (cache) =>
          applyIncoming(
            cache,
            serverMessage({
              id: "m-theirs",
              authorId: "u-grace",
              content: "mine, with your nonce",
            }),
          ),
      );
    });

    act(() => {
      result.current.send({
        content: "hello",
        nonce: NONCE,
        authorId: AUTHOR_ID,
      });
    });

    await waitFor(() => {
      expect(entries().map((entry) => entry.id)).toContain("m-server");
    });

    const theirs = entries().find((entry) => entry.id === "m-theirs");

    expect(theirs?.content).toBe("mine, with your nonce");
    expect(entries()).toHaveLength(2);
    expect(new Set(entries().map((entry) => rowKey(entry))).size).toBe(2);
  });

  it("leaves a draft typed while the send was in flight untouched", async () => {
    let settle: (response: Response) => void = () => undefined;

    const inFlight = new Promise<Response>((resolve) => {
      settle = resolve;
    });

    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockReturnValue(inFlight));

    const { result } = renderHook(() => useSendMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.send({
        content: "hello",
        nonce: NONCE,
        authorId: AUTHOR_ID,
      });
    });

    act(() => {
      useDrafts.getState().setDraft(CHANNEL_ID, "the next message");
    });

    act(() => {
      settle(respond(201, serverMessage()));
    });

    await waitFor(() => {
      expect(entries()[0]?.id).toBe("m-server");
    });

    expect(useDrafts.getState().byChannel[CHANNEL_ID]).toBe("the next message");
  });

  it("leaves a 500 in the list as a retriable failure on the same nonce", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        respond(500, {
          error: { code: "INTERNAL", message: "Internal server error" },
        }),
      )
      .mockResolvedValueOnce(respond(201, serverMessage()));

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSendMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.send({
        content: "hello",
        nonce: NONCE,
        authorId: AUTHOR_ID,
      });
    });

    await waitFor(() => {
      expect(entries()[0]?.local?.status).toBe("failed");
    });

    expect(entries()[0]?.local?.retry).toBe("same-nonce");
    expect(entries()).toHaveLength(1);

    const failed = entries()[0];

    if (failed === undefined) {
      throw new Error("the optimistic entry disappeared");
    }

    act(() => {
      result.current.retry(failed, AUTHOR_ID);
    });

    await waitFor(() => {
      expect(entries()[0]?.id).toBe("m-server");
    });

    const bodies = fetchMock.mock.calls.map(
      ([, init]) => JSON.parse(bodyOf(init)) as unknown,
    );

    expect(bodies).toEqual([
      { content: "hello", nonce: NONCE },
      { content: "hello", nonce: NONCE },
    ]);
  });

  it("mints a new nonce when the server reports NONCE_REUSED", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        respond(409, {
          error: { code: "NONCE_REUSED", message: "Nonce already used" },
        }),
      )
      .mockImplementationOnce((_input, init) =>
        Promise.resolve(
          respond(
            201,
            serverMessage({
              nonce: (JSON.parse(bodyOf(init)) as { nonce: string }).nonce,
            }),
          ),
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSendMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.send({
        content: "hello",
        nonce: NONCE,
        authorId: AUTHOR_ID,
      });
    });

    await waitFor(() => {
      expect(entries()[0]?.local?.retry).toBe("new-nonce");
    });

    const failed = entries()[0];

    if (failed === undefined) {
      throw new Error("the optimistic entry disappeared");
    }

    act(() => {
      result.current.retry(failed, AUTHOR_ID);
    });

    await waitFor(() => {
      expect(entries()[0]?.id).toBe("m-server");
    });

    const nonces = fetchMock.mock.calls.map(
      ([, init]) => (JSON.parse(bodyOf(init)) as { nonce: string }).nonce,
    );

    expect(nonces[0]).toBe(NONCE);
    expect(nonces[1]).not.toBe(NONCE);
  });

  it("offers the claim, not a retry, after GUEST_QUOTA_REACHED", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      respond(403, {
        error: {
          code: "GUEST_QUOTA_REACHED",
          message: "Guest quota reached",
        },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSendMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.send({
        content: "hello",
        nonce: NONCE,
        authorId: AUTHOR_ID,
      });
    });

    await waitFor(() => {
      expect(entries()[0]?.local?.retry).toBe("claim");
    });

    const failed = entries()[0];

    if (failed === undefined) {
      throw new Error("the optimistic entry disappeared");
    }

    act(() => {
      result.current.retry(failed, AUTHOR_ID);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops a failed message when the author discards it", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          respond(500, { error: { code: "INTERNAL", message: "boom" } }),
        ),
    );

    const { result } = renderHook(() => useSendMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.send({
        content: "hello",
        nonce: NONCE,
        authorId: AUTHOR_ID,
      });
    });

    await waitFor(() => {
      expect(entries()[0]?.local?.status).toBe("failed");
    });

    const failed = entries()[0];

    if (failed === undefined) {
      throw new Error("the optimistic entry disappeared");
    }

    act(() => {
      result.current.discard(failed);
    });

    expect(entries()).toHaveLength(0);
  });

  it("does not fail a send the socket already confirmed", async () => {
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

    const { result } = renderHook(() => useSendMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.send({
        content: "hello",
        nonce: NONCE,
        authorId: AUTHOR_ID,
      });
    });

    await waitFor(() => {
      expect(deferred.reject).toBeDefined();
    });

    act(() => {
      client.setQueryData<MessageCache>(
        channelMessagesQueryKey(CHANNEL_ID),
        (current) => applyIncoming(current, serverMessage()),
      );
    });

    expect(entries()[0]?.id).toBe("m-server");

    act(() => {
      deferred.reject?.(new TypeError("Failed to fetch"));
    });

    await waitFor(() => {
      expect(entries()[0]?.local).toBeUndefined();
    });

    const confirmed = entries()[0];

    if (confirmed === undefined) {
      throw new Error("the confirmed message disappeared");
    }

    act(() => {
      result.current.discard(confirmed);
    });

    expect(entries().map((entry) => entry.id)).toEqual(["m-server"]);
  });

  it("writes nothing once the account it was sent for has been left", async () => {
    const deferred: { resolve?: (value: Response) => void } = {};

    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            deferred.resolve = resolve;
          }),
      ),
    );

    const { result } = renderHook(() => useSendMessage(CHANNEL_ID), {
      wrapper,
    });

    act(() => {
      result.current.send({
        content: "hello",
        nonce: NONCE,
        authorId: AUTHOR_ID,
      });
    });

    await waitFor(() => {
      expect(deferred.resolve).toBeDefined();
    });

    expect(entries()).toHaveLength(1);

    act(() => {
      endAccountScope();
      client.setQueryData<MessageCache>(channelMessagesQueryKey(CHANNEL_ID), {
        pages: [{ data: [], nextCursor: null }],
        pageParams: [null],
      });
    });

    act(() => {
      deferred.resolve?.(
        new Response(JSON.stringify(serverMessage()), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    expect(entries()).toEqual([]);
  });
});
