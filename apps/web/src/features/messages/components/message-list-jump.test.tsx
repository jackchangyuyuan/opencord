import type { Message } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessageList } from "./message-list";

const CHANNEL_ID = "44444444-4444-4444-8444-444444444444";

const scrollToIndex = vi.fn();
const scrollIntoView = vi.fn();

let unmounted: Set<string>;

vi.mock("react-virtuoso", () => ({
  Virtuoso: ({
    data,
    firstItemIndex,
    itemContent,
    ref,
    scrollerRef,
  }: {
    data: { key: string }[];
    firstItemIndex: number;
    itemContent: (index: number, row: unknown) => React.ReactNode;
    ref?: { current: unknown };
    scrollerRef?: (node: HTMLElement | null) => void;
  }) => {
    if (ref !== undefined) {
      ref.current = { scrollIntoView, scrollToIndex };
    }

    return (
      <div
        data-testid="virtuoso"
        ref={(node) => {
          scrollerRef?.(node);
        }}
      >
        {data.map((row, index) =>
          unmounted.has(row.key) ? null : (
            <div key={row.key}>{itemContent(firstItemIndex + index, row)}</div>
          ),
        )}
      </div>
    );
  },
}));

const VIEWPORT = { bottom: 800, top: 100 };
let boxes: Record<string, { bottom: number; top: number }>;
let scrollTop: number;
let writes: number[];

function installGeometry() {
  scrollTop = 0;
  writes = [];

  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect() {
        return undefined;
      }

      observe() {
        return undefined;
      }

      unobserve() {
        return undefined;
      }
    },
  );

  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const key = this.getAttribute("data-row-key");
      const box =
        this.getAttribute("data-testid") === "virtuoso"
          ? VIEWPORT
          : (boxes[key ?? ""] ?? { bottom: 0, top: 0 });

      return new DOMRect(0, box.top - scrollTop, 0, box.bottom - box.top);
    },
  );

  Object.defineProperty(HTMLElement.prototype, "scrollTop", {
    configurable: true,
    get() {
      return scrollTop;
    },
    set(next: number) {
      writes.push(Math.round(next));
      scrollTop = next;
    },
  });
}

function message(id: string, content: string, minute: number): Message {
  return {
    attachments: [],
    authorId: "u-ada",
    channelId: CHANNEL_ID,
    content,
    createdAt: `2026-09-01T10:0${String(minute)}:00.000Z`,
    deletedAt: null,
    editedAt: null,
    id,
    nonce: null,
    pinnedAt: null,
    pinnedBy: null,
    reactions: [],
    replyTo: null,
    replyToId: null,
  };
}

function replyTo(entry: Message, targetId: string, targetText: string) {
  return {
    ...entry,
    replyTo: {
      authorId: "u-ada",
      content: targetText,
      deletedAt: null,
      id: targetId,
    },
    replyToId: targetId,
  };
}

function stubApi(data: Message[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();

      const body = url.includes("/messages")
        ? { data, nextCursor: null }
        : { avatarUrl: null, id: "u-ada", name: "Ada", username: "ada" };

      return Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    }),
  );
}

function Address() {
  const location = useLocation();

  return (
    <output data-testid="address">{`${location.pathname}${location.search}`}</output>
  );
}

function mountList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app"]}>
        <MessageList channelId={CHANNEL_ID} />
        <Address />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const LOADED = [
  replyTo(message("m-3", "third", 3), "m-1", "first"),
  message("m-2", "second", 2),
  message("m-1", "first", 1),
];

async function clickTheQuotedLine(text = "first") {
  const user = userEvent.setup();

  await user.click(
    await screen.findByText(text, {
      selector: '[data-slot="reply-context"] *',
    }),
  );
}

beforeEach(() => {
  unmounted = new Set();
  boxes = { "m-1": { bottom: 360, top: 300 } };
  scrollToIndex.mockClear();
  scrollIntoView.mockClear();
  installGeometry();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("jumping to a replied-to message", () => {
  it("leaves a target that is already on screen exactly where it is", async () => {
    stubApi(LOADED);
    mountList();

    await clickTheQuotedLine();

    await waitFor(() => {
      expect(screen.getByTestId("address")).toHaveTextContent("/app");
    });

    expect(writes).toEqual([]);
    expect(scrollToIndex).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("places a mounted target with a single exact write and no virtualiser call", async () => {
    boxes = { "m-1": { bottom: 60, top: 0 } };
    stubApi(LOADED);
    mountList();

    await clickTheQuotedLine();

    await waitFor(() => {
      expect(writes.length).toBeGreaterThan(0);
    });

    expect(writes).toEqual([-124]);
    expect(scrollToIndex).not.toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("reveals a target below the fold against the bottom edge", async () => {
    boxes = { "m-1": { bottom: 860, top: 800 } };
    stubApi(LOADED);
    mountList();

    await clickTheQuotedLine();

    await waitFor(() => {
      expect(writes.length).toBeGreaterThan(0);
    });

    expect(writes).toEqual([84]);
  });

  it("asks the virtualiser once for a target outside the rendered window", async () => {
    unmounted = new Set(["m-1"]);
    stubApi(LOADED);
    mountList();

    await clickTheQuotedLine();

    await waitFor(() => {
      expect(scrollToIndex).toHaveBeenCalledTimes(1);
    });

    expect(scrollToIndex).toHaveBeenCalledWith({
      align: "center",
      behavior: "auto",
      index: 1,
    });
    expect(screen.getByTestId("address")).toHaveTextContent("/app");
  });

  it("asks for a window of history when the message is not in these pages", async () => {
    stubApi([
      replyTo(message("m-3", "third", 3), "m-older", "something older"),
      message("m-2", "second", 2),
    ]);
    mountList();

    await clickTheQuotedLine("something older");

    await waitFor(() => {
      expect(screen.getByTestId("address")).toHaveTextContent(
        `/app/channels/${CHANNEL_ID}?around=m-older`,
      );
    });

    expect(scrollToIndex).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
