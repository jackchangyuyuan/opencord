import type { Message } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MessageCache } from "@/features/messages/api/queries";
import { channelPinsQueryKey } from "@/features/messages/api/queries";
import { applyMessageEvent } from "@/features/realtime/lib/apply-message-event";

import { PinList } from "./pin-list";
import { PinnedIndicator } from "./pinned-indicator";

const CHANNEL_ID = "88888888-8888-4888-8888-888888888888";

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "m-1",
    channelId: CHANNEL_ID,
    authorId: "u-ada",
    content: "keep this",
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
let pins: Message[];

function renderList() {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app"]}>
        <PinList channelId={CHANNEL_ID} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  client.setQueryData(["users", "u-ada"], {
    id: "u-ada",
    username: "ada",
    name: "Ada",
    avatarUrl: null,
  });

  pins = [];

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(JSON.stringify(url.endsWith("/pins") ? pins : {})),
      ),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PinList", () => {
  it("says so when nothing is pinned", async () => {
    const user = userEvent.setup();

    renderList();

    await user.click(screen.getByRole("button", { name: "Pinned messages" }));

    expect(
      await screen.findByText("Nothing is pinned yet"),
    ).toBeInTheDocument();
  });

  it("lists the pins newest-pin-first, as the server ordered them", async () => {
    const user = userEvent.setup();

    pins = [
      message({
        id: "m-2",
        content: "second",
        pinnedAt: "2026-09-11T11:00:00.000Z",
      }),
      message({
        id: "m-1",
        content: "first",
        pinnedAt: "2026-09-11T10:00:00.000Z",
      }),
    ];

    renderList();

    await user.click(screen.getByRole("button", { name: "Pinned messages" }));

    const entries = await screen.findAllByRole("listitem");

    expect(entries[0]).toHaveTextContent("second");
    expect(entries[1]).toHaveTextContent("first");
  });

  it("renders nothing without a channel", () => {
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app"]}>
          <PinList channelId={undefined} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("PinnedIndicator", () => {
  it("marks a pinned row", () => {
    render(<PinnedIndicator pinnedAt="2026-09-11T10:00:00.000Z" />);

    expect(screen.getByText("Pinned")).toBeInTheDocument();
  });

  it("says nothing about an unpinned row", () => {
    const { container } = render(<PinnedIndicator pinnedAt={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("a message:pin event", () => {
  it("marks the cached row pinned without refetching the channel", () => {
    const pinnedAt = "2026-09-11T11:00:00.000Z";

    const cache: MessageCache = {
      pages: [{ data: [message()], nextCursor: null }],
      pageParams: [null],
    };

    const next = applyMessageEvent(cache, {
      type: "pin",
      payload: {
        channelId: CHANNEL_ID,
        messageId: "m-1",
        pinnedAt,
        pinnedBy: "u-ada",
      },
    });

    expect(next?.pages[0]?.data[0]?.pinnedAt).toBe(pinnedAt);
    expect(next?.pages[0]?.data[0]?.pinnedBy).toBe("u-ada");
  });

  it("is not undone by an edit that carries the old pin state", () => {
    const pinnedAt = "2026-09-11T11:00:00.000Z";

    const cache: MessageCache = {
      pages: [
        { data: [message({ pinnedAt, pinnedBy: "u-ada" })], nextCursor: null },
      ],
      pageParams: [null],
    };

    const next = applyMessageEvent(cache, {
      type: "update",
      message: message({ content: "edited" }),
    });

    expect(next?.pages[0]?.data[0]?.content).toBe("edited");
    expect(next?.pages[0]?.data[0]?.pinnedAt).toBe(pinnedAt);
    expect(next?.pages[0]?.data[0]?.pinnedBy).toBe("u-ada");
  });

  it("refills the popover once the pin query is invalidated", async () => {
    const user = userEvent.setup();

    renderList();

    await user.click(screen.getByRole("button", { name: "Pinned messages" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("pin me")).not.toBeInTheDocument();

    pins = [
      message({ content: "pin me", pinnedAt: "2026-09-11T11:00:00.000Z" }),
    ];

    await act(async () => {
      await client.invalidateQueries({
        queryKey: channelPinsQueryKey(CHANNEL_ID),
      });
    });

    expect(await screen.findByText("pin me")).toBeInTheDocument();
  });
});
