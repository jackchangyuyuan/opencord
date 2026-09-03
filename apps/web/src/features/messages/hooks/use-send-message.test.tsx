import type { Message } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  channelMessagesQueryKey,
  type MessagePage,
} from "@/features/messages/api/queries";
import { useDrafts } from "@/stores/drafts";

import {
  applyIncoming,
  type ChatMessage,
  type MessageCache,
  useSendMessage,
} from "./use-send-message";

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
      local: { status: "sending", retry: "same-nonce", reason: null },
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

  it("prepends a message it has never seen", () => {
    const applied = applyIncoming(
      applyIncoming(undefined, serverMessage()),
      serverMessage({ id: "m-other", nonce: null }),
    );

    expect(applied.pages[0]?.data.map((entry) => entry.id)).toEqual([
      "m-other",
      "m-server",
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
      .mockResolvedValueOnce(respond(201, serverMessage({ nonce: "other" })));

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

  it("offers no retry after GUEST_QUOTA_REACHED", async () => {
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
      expect(entries()[0]?.local?.retry).toBe("none");
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
});
