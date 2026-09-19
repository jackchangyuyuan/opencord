import type { Message } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { channelQuery } from "@/features/channels/api/queries";
import { channelMessagesQueryKey } from "@/features/messages/api/queries";
import { EVERYTHING_UNREAD } from "@/features/messages/hooks/use-mark-read";
import {
  FIXTURE_SERVER_ID,
  seedConversation,
} from "@/features/messages/lib/conversation-fixture";
import {
  buildRows,
  flattenPages,
  listAnchor,
  prependedCount,
  unreadBoundaryKey,
} from "@/features/messages/lib/rows";
import { localDay } from "@/lib/local-day";
import { useUi } from "@/stores/ui";

import { MessageList } from "./message-list";

vi.mock("react-virtuoso", () => ({
  Virtuoso: ({
    data,
    itemContent,
    firstItemIndex,
    initialTopMostItemIndex,
    scrollerRef,
  }: {
    data: { key: string }[];
    itemContent: (index: number, row: unknown) => React.ReactNode;
    firstItemIndex: number;
    initialTopMostItemIndex?: unknown;
    scrollerRef?: (ref: HTMLElement | null) => void;
  }) => (
    <div
      data-first-item-index={firstItemIndex}
      data-mount-at={JSON.stringify(initialTopMostItemIndex ?? null)}
      data-testid="virtuoso"
      ref={(node) => {
        scrollerRef?.(node);
      }}
    >
      {data.map((row, index) => (
        <div key={row.key}>{itemContent(firstItemIndex + index, row)}</div>
      ))}
    </div>
  ),
}));

const CHANNEL_ID = "44444444-4444-4444-8444-444444444444";

function message(
  id: string,
  authorId: string,
  createdAt: string,
  content: string,
): Message {
  return {
    id,
    channelId: CHANNEL_ID,
    authorId,
    content,
    nonce: null,
    replyToId: null,
    replyTo: null,
    pinnedAt: null,
    pinnedBy: null,
    editedAt: null,
    deletedAt: null,
    createdAt,
    reactions: [],
    attachments: [],
  };
}

const NEWEST_FIRST = [
  message("m-3", "u-ada", "2026-09-02T09:02:00.000Z", "third"),
  message("m-2", "u-ada", "2026-09-01T10:01:00.000Z", "second"),
  message("m-1", "u-ada", "2026-09-01T10:00:00.000Z", "first"),
];

function stubBody(
  url: string,
  page: { data: Message[]; nextCursor: string | null },
): unknown {
  if (url.includes("/messages")) {
    return page;
  }

  if (url.includes("/overwrites")) {
    return { roles: [], members: [] };
  }

  if (url.includes("/members") || url.includes("/roles")) {
    return [];
  }

  if (/\/servers\/[^/?]+$/.test(url)) {
    return {
      id: FIXTURE_SERVER_ID,
      name: "Fixture",
      ownerId: "u-ada",
      everyoneRole: { id: "r-everyone", permissions: 0 },
      viewerRoles: [],
    };
  }

  return { id: "u-ada", username: "ada", name: "Ada", avatarUrl: null };
}

function stubApi(page: { data: Message[]; nextCursor: string | null }) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();

      return Promise.resolve(
        new Response(JSON.stringify(stubBody(url, page)), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
}

function mountList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  seedConversation(client, CHANNEL_ID);

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app"]}>
        <MessageList channelId={CHANNEL_ID} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("flattenPages", () => {
  it("turns newest-first pages into an oldest-first list", () => {
    const older = [
      message("m-0", "u-ada", "2026-08-31T10:00:00.000Z", "zeroth"),
    ];

    expect(
      flattenPages([{ data: NEWEST_FIRST }, { data: older }]).map(
        (entry) => entry.id,
      ),
    ).toEqual(["m-0", "m-1", "m-2", "m-3"]);
  });
});

describe("buildRows", () => {
  const oldestFirst = flattenPages([{ data: NEWEST_FIRST }]);

  it("puts a date divider before the first message of each day", () => {
    const rows = buildRows(oldestFirst);

    expect(rows.map((row) => row.kind)).toEqual([
      "date",
      "message",
      "message",
      "date",
      "message",
    ]);
  });

  it("groups a follow-up from the same author inside the window", () => {
    const rows = buildRows(oldestFirst).filter((row) => row.kind === "message");

    expect(rows.map((row) => row.grouped)).toEqual([false, true, false]);
  });

  it("breaks the group when the author changes", () => {
    const rows = buildRows([
      message("m-1", "u-ada", "2026-09-01T10:00:00.000Z", "a"),
      message("m-2", "u-grace", "2026-09-01T10:00:30.000Z", "b"),
    ]).filter((row) => row.kind === "message");

    expect(rows.map((row) => row.grouped)).toEqual([false, false]);
  });

  it("breaks the group when the gap exceeds the window", () => {
    const rows = buildRows([
      message("m-1", "u-ada", "2026-09-01T10:00:00.000Z", "a"),
      message("m-2", "u-ada", "2026-09-01T10:06:00.000Z", "b"),
    ]).filter((row) => row.kind === "message");

    expect(rows.map((row) => row.grouped)).toEqual([false, false]);
  });

  it("breaks the group for a reply, even from the same author", () => {
    const rows = buildRows([
      message("m-1", "u-ada", "2026-09-01T10:00:00.000Z", "a"),
      message("m-2", "u-ada", "2026-09-01T10:00:30.000Z", "b"),
      {
        ...message("m-3", "u-ada", "2026-09-01T10:01:00.000Z", "c"),
        replyToId: "m-1",
        replyTo: {
          id: "m-1",
          authorId: "u-ada",
          content: "a",
          deletedAt: null,
        },
      },
      message("m-4", "u-ada", "2026-09-01T10:01:30.000Z", "d"),
    ]).filter((row) => row.kind === "message");

    expect(rows.map((row) => row.grouped)).toEqual([false, true, false, true]);
  });

  it("marks the message a date divider was emitted for", () => {
    const rows = buildRows(oldestFirst).filter((row) => row.kind === "message");

    expect(rows.map((row) => row.firstOfDay)).toEqual([true, false, true]);
  });
});

describe("localDay", () => {
  it("names the viewer's calendar day, not the UTC one", () => {
    expect(localDay("2026-09-11T23:30:00.000Z")).toBe("2026-09-12");
    expect(localDay("2026-09-11T14:30:00.000Z")).toBe("2026-09-11");
  });
});

describe("date dividers follow the viewer's calendar", () => {
  it("keeps one divider across midnight UTC inside a single local day", () => {
    const rows = buildRows([
      message("m-1", "u-ada", "2026-09-11T23:30:00.000Z", "before"),
      message("m-2", "u-ada", "2026-09-12T00:30:00.000Z", "after"),
    ]);

    expect(rows.filter((row) => row.kind === "date")).toHaveLength(1);
    expect(rows.map((row) => row.kind)).toEqual(["date", "message", "message"]);
  });

  it("starts a new divider at local midnight inside a single UTC day", () => {
    const rows = buildRows([
      message("m-1", "u-ada", "2026-09-11T14:30:00.000Z", "before"),
      message("m-2", "u-ada", "2026-09-11T15:30:00.000Z", "after"),
    ]);

    expect(rows.map((row) => row.kind)).toEqual([
      "date",
      "message",
      "date",
      "message",
    ]);
    expect(
      rows.filter((row) => row.kind === "date").map((row) => row.day),
    ).toEqual(["2026-09-11", "2026-09-12"]);
  });

  it("breaks same-author grouping at the local day boundary", () => {
    const rows = buildRows([
      message("m-1", "u-ada", "2026-09-11T14:59:00.000Z", "before"),
      message("m-2", "u-ada", "2026-09-11T15:01:00.000Z", "after"),
    ]);

    expect(
      rows.filter((row) => row.kind === "message").map((row) => row.grouped),
    ).toEqual([false, false]);
  });
});

describe("unreadBoundaryKey", () => {
  const rows = buildRows(flattenPages([{ data: NEWEST_FIRST }]));

  const MORE_HISTORY = false;
  const WHOLE_CHANNEL = true;

  it("is nothing when the channel has no unread state", () => {
    expect(unreadBoundaryKey(rows, null, MORE_HISTORY)).toBeNull();
  });

  it("is the first message after the watermark", () => {
    expect(unreadBoundaryKey(rows, "m-1", MORE_HISTORY)).toBe("m-2");
  });

  it("is nothing when the watermark is the newest loaded message", () => {
    expect(unreadBoundaryKey(rows, "m-3", MORE_HISTORY)).toBeNull();
  });

  it("is nothing when the watermark is older than every loaded message", () => {
    expect(unreadBoundaryKey(rows, "m-0", MORE_HISTORY)).toBeNull();
  });

  it("is nothing for a channel that has never been read", () => {
    expect(unreadBoundaryKey(rows, EVERYTHING_UNREAD, MORE_HISTORY)).toBeNull();
  });

  it("is the first message once the whole channel is loaded", () => {
    expect(unreadBoundaryKey(rows, EVERYTHING_UNREAD, WHOLE_CHANNEL)).toBe(
      "m-1",
    );
    expect(unreadBoundaryKey(rows, "m-0", WHOLE_CHANNEL)).toBe("m-1");
  });

  it("is the same message once the page holding the read side lands", () => {
    const older = buildRows(
      flattenPages([
        { data: NEWEST_FIRST },
        {
          data: [message("m-0", "u-ada", "2026-08-31T10:00:00.000Z", "zeroth")],
        },
      ]),
    );

    expect(unreadBoundaryKey(older, "m-0", MORE_HISTORY)).toBe("m-1");
  });
});

describe("prependedCount", () => {
  const page = [
    message("m-3", "u-ada", "2026-09-11T15:30:00.000Z", "a"),
    message("m-4", "u-ada", "2026-09-11T15:31:00.000Z", "b"),
  ];

  const rows = buildRows(page);

  it("is nothing before the first page is known", () => {
    expect(prependedCount(null, rows)).toBe(0);
  });

  it("is nothing while the list is unchanged", () => {
    expect(prependedCount(listAnchor(rows), rows)).toBe(0);
  });

  it("counts the rows inserted ahead of the anchor", () => {
    const older = buildRows([
      message("m-1", "u-ada", "2026-09-10T09:00:00.000Z", "older"),
      ...page,
    ]);

    expect(prependedCount(listAnchor(rows), older)).toBe(2);
  });

  it("counts an older page that lands on the same day", () => {
    const older = buildRows([
      message("m-1", "u-ada", "2026-09-11T15:20:00.000Z", "older"),
      message("m-2", "u-ada", "2026-09-11T15:25:00.000Z", "older still"),
      ...page,
    ]);

    expect(older.filter((row) => row.kind === "date")).toHaveLength(1);
    expect(prependedCount(listAnchor(rows), older)).toBe(2);
  });

  it("is nothing when the anchor is gone", () => {
    expect(prependedCount({ key: "m-gone", index: 1 }, rows)).toBe(0);
  });
});

describe("MessageList", () => {
  it("renders the channel oldest-first with its dividers", async () => {
    stubApi({ data: NEWEST_FIRST, nextCursor: null });

    mountList();

    expect(await screen.findByText("first")).toBeInTheDocument();

    expect(screen.getByTestId("virtuoso")).toHaveTextContent(
      /first.*second.*third/s,
    );
  });

  it("holds firstItemIndex still while messages arrive at the end", async () => {
    stubApi({ data: NEWEST_FIRST, nextCursor: null });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    seedConversation(client, CHANNEL_ID);

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app"]}>
          <MessageList channelId={CHANNEL_ID} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("first");

    expect(screen.getByTestId("virtuoso")).toHaveAttribute(
      "data-first-item-index",
      String(1_000_000),
    );

    act(() => {
      client.setQueryData(channelMessagesQueryKey(CHANNEL_ID), {
        pages: [
          {
            data: [
              message("m-4", "u-ada", "2026-09-02T09:05:00.000Z", "arrived"),
              ...NEWEST_FIRST,
            ],
            nextCursor: null,
          },
        ],
        pageParams: [null],
      });
    });

    await screen.findAllByText("arrived");

    expect(screen.getByTestId("virtuoso")).toHaveAttribute(
      "data-first-item-index",
      String(1_000_000),
    );
  });

  it("winds firstItemIndex back by the rows an older page prepends", async () => {
    stubApi({ data: NEWEST_FIRST, nextCursor: "cursor-1" });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    seedConversation(client, CHANNEL_ID);

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app"]}>
          <MessageList channelId={CHANNEL_ID} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("first");

    act(() => {
      client.setQueryData(channelMessagesQueryKey(CHANNEL_ID), {
        pages: [
          { data: NEWEST_FIRST, nextCursor: "cursor-1" },
          {
            data: [
              message("m-0", "u-ada", "2026-08-31T10:00:00.000Z", "zeroth"),
            ],
            nextCursor: null,
          },
        ],
        pageParams: [null, "cursor-1"],
      });
    });

    await screen.findByText("zeroth");

    expect(screen.getByTestId("virtuoso")).toHaveAttribute(
      "data-first-item-index",
      String(1_000_000 - 2),
    );
  });

  it("declares an empty polite live region for arriving messages", async () => {
    stubApi({ data: NEWEST_FIRST, nextCursor: null });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    seedConversation(client, CHANNEL_ID);

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app"]}>
          <MessageList channelId={CHANNEL_ID} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const region = screen.getByRole("status");

    expect(region).toHaveAttribute("aria-live", "polite");

    await waitFor(() => {
      expect(region).toBeEmptyDOMElement();
    });
  });

  it("announces an arriving message in the live region, but not the history", async () => {
    stubApi({ data: NEWEST_FIRST, nextCursor: null });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    seedConversation(client, CHANNEL_ID);

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app"]}>
          <MessageList channelId={CHANNEL_ID} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("third");

    const region = screen.getByRole("status");

    expect(region).toBeEmptyDOMElement();

    act(() => {
      client.setQueryData(channelMessagesQueryKey(CHANNEL_ID), {
        pages: [
          {
            data: [
              message("m-4", "u-ada", "2026-09-02T09:05:00.000Z", "arrived"),
              ...NEWEST_FIRST,
            ],
            nextCursor: null,
          },
        ],
        pageParams: [null],
      });
    });

    await waitFor(() => {
      expect(region).toHaveTextContent("arrived");
    });
  });

  it("invites the reader to pick a channel when none is routed", () => {
    stubApi({ data: [], nextCursor: null });

    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/app"]}>
          <MessageList channelId={undefined} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      screen.getByText("Choose a channel to start reading"),
    ).toBeInTheDocument();
  });
});

describe("choosing Reply", () => {
  afterEach(() => {
    useUi.setState({ replyTarget: null });
  });

  it("does not scroll the conversation", async () => {
    stubApi({ data: NEWEST_FIRST, nextCursor: null });
    mountList();

    await screen.findByText("third");

    const scroller = screen.getByTestId("virtuoso");

    const writes: number[] = [];

    Object.defineProperty(scroller, "scrollHeight", {
      configurable: true,
      get: () => 10411,
    });
    Object.defineProperty(scroller, "clientHeight", {
      configurable: true,
      get: () => 716,
    });
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      get: () => 4106,
      set: (value: number) => writes.push(value),
    });

    act(() => {
      useUi.getState().setReplyTarget({
        channelId: CHANNEL_ID,
        messageId: "m-1",
        authorId: "u-ada",
        content: "first",
      });
    });

    await waitFor(() => {
      expect(useUi.getState().replyTarget?.messageId).toBe("m-1");
    });

    expect(writes).toEqual([]);
  });
});

function mountWithWatermark(lastReadMessageId: string | null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  seedConversation(client, CHANNEL_ID, {
    lastMessageId: "m-3",
    lastReadMessageId,
    hasUnread: true,
    unreadCount: 3,
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app"]}>
        <MessageList channelId={CHANNEL_ID} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function dividerRowText(): string | null {
  const marker = screen.queryByRole("separator");

  return marker === null
    ? null
    : (marker.parentElement?.getAttribute("data-row-key") ?? null);
}

describe("the unread boundary", () => {
  it("marks the first message after the watermark", async () => {
    stubApi({ data: NEWEST_FIRST, nextCursor: null });

    mountWithWatermark("m-1");

    expect(await screen.findByText("first")).toBeInTheDocument();

    await waitFor(() => {
      expect(dividerRowText()).toBe("m-2");
    });
  });

  it("marks nothing when the watermark is older than the loaded window", async () => {
    stubApi({ data: NEWEST_FIRST, nextCursor: "cursor-1" });

    mountWithWatermark("m-0");

    expect(await screen.findByText("first")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("virtuoso")).toHaveTextContent("third");
    });

    expect(dividerRowText()).toBeNull();
  });

  it("marks nothing for a never-read channel with history still above", async () => {
    stubApi({ data: NEWEST_FIRST, nextCursor: "cursor-1" });

    mountWithWatermark(null);

    expect(await screen.findByText("first")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId("virtuoso")).toHaveTextContent("third");
    });

    expect(dividerRowText()).toBeNull();
  });

  it("waits for the list before mounting, then opens on the boundary", async () => {
    stubApi({ data: NEWEST_FIRST, nextCursor: null });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    client.setQueryData(channelQuery(CHANNEL_ID).queryKey, {
      id: CHANNEL_ID,
      serverId: FIXTURE_SERVER_ID,
      type: "text",
      name: "general",
      topic: null,
      position: 0,
      lastMessageId: "m-3",
      lastEveryoneMentionId: null,
      createdAt: "2026-09-01T09:00:00.000Z",
    });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app"]}>
          <MessageList channelId={CHANNEL_ID} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        client.getQueryData(channelMessagesQueryKey(CHANNEL_ID)),
      ).toBeDefined();
    });

    expect(screen.queryByTestId("virtuoso")).not.toBeInTheDocument();

    act(() => {
      seedConversation(client, CHANNEL_ID, {
        lastMessageId: "m-3",
        lastReadMessageId: "m-1",
        hasUnread: true,
        unreadCount: 2,
      });
    });

    expect(await screen.findByTestId("virtuoso")).toBeInTheDocument();

    await waitFor(() => {
      expect(dividerRowText()).toBe("m-2");
    });
  });

  // The boundary row itself, and with no offset of its own: the marker is drawn
  // at the top of that row, so mounting on it is what puts the line against the
  // top edge. A pixel allowance instead of a row clipped a tall message and left
  // part of an earlier one showing, which is the marker sitting lower than it
  // belongs.
  it("mounts on the unread boundary, with no offset of its own", async () => {
    stubApi({ data: NEWEST_FIRST, nextCursor: null });

    mountWithWatermark("m-1");

    expect(await screen.findByText("first")).toBeInTheDocument();

    await waitFor(() => {
      expect(dividerRowText()).toBe("m-2");
    });

    expect(screen.getByTestId("virtuoso")).toHaveAttribute(
      "data-mount-at",
      JSON.stringify({ align: "start", index: 2 }),
    );
  });

  it("marks the first message of a never-read channel it has loaded whole", async () => {
    stubApi({ data: NEWEST_FIRST, nextCursor: null });

    mountWithWatermark(null);

    expect(await screen.findByText("first")).toBeInTheDocument();

    await waitFor(() => {
      expect(dividerRowText()).toBe("m-1");
    });
  });
});
