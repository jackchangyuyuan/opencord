import type { Message } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchResponse } from "@/features/search/api/queries";

import { SearchPanel } from "./search-panel";

const CHANNEL_ID = "88888888-8888-4888-8888-888888888888";

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
  };
}

let searchResponse: SearchResponse;
let requestedUrls: string[];

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      requestedUrls.push(url);

      if (url.startsWith("/api/v1/search")) {
        return Promise.resolve(new Response(JSON.stringify(searchResponse)));
      }

      return Promise.resolve(new Response(JSON.stringify([])));
    }),
  );
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app"]}>
        <SearchPanel />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  requestedUrls = [];
  searchResponse = {
    data: [message("m-1", "the rollback finished")],
    degraded: false,
    limit: 25,
    offset: 0,
  };

  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SearchPanel", () => {
  it("runs nothing until a query is submitted", () => {
    renderPanel();

    expect(
      screen.getByText("Search this server’s archive."),
    ).toBeInTheDocument();
    expect(requestedUrls.some((url) => url.startsWith("/api/v1/search"))).toBe(
      false,
    );
  });

  it("shows the ranked results for a free-text query", async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.type(
      screen.getByRole("textbox", { name: "Search messages" }),
      "rollback",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(
      await screen.findByText("the rollback finished"),
    ).toBeInTheDocument();
    expect(
      requestedUrls.find((url) => url.startsWith("/api/v1/search")),
    ).toContain("q=rollback");
  });

  it("renders a chip for each filter and round-trips it to the text", async () => {
    const user = userEvent.setup();

    renderPanel();

    const input = screen.getByRole("textbox", { name: "Search messages" });

    await user.type(input, "in:#general from:@ana rollback");

    expect(screen.getByText("in:#general")).toBeInTheDocument();
    expect(screen.getByText("from:@ana")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Remove the in filter" }),
    );

    expect(input).toHaveValue("from:@ana rollback");
    expect(screen.queryByText("in:#general")).not.toBeInTheDocument();
  });

  it("explains a filter-only query the server had to degrade", async () => {
    const user = userEvent.setup();

    searchResponse = { ...searchResponse, degraded: true };

    renderPanel();

    await user.type(
      screen.getByRole("textbox", { name: "Search messages" }),
      "in:#general the",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(
      await screen.findByText("Showing all messages matching your filters."),
    ).toBeInTheDocument();
  });

  it("says so when nothing matched", async () => {
    const user = userEvent.setup();

    searchResponse = { data: [], degraded: false, limit: 25, offset: 0 };

    renderPanel();

    await user.type(
      screen.getByRole("textbox", { name: "Search messages" }),
      "rollback",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("No messages matched.")).toBeInTheDocument();
  });

  it("jumps to the message the result names", async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.type(
      screen.getByRole("textbox", { name: "Search messages" }),
      "rollback",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    const result = await screen.findByText("the rollback finished");

    await user.click(result);

    await waitFor(() => {
      expect(window.location.pathname).not.toBe("");
    });
  });
});
