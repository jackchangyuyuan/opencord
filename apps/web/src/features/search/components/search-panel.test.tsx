import type { Message } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    attachments: [],
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
      screen.getByText("Search this server's archive"),
    ).toBeInTheDocument();
    expect(requestedUrls.some((url) => url.startsWith("/api/v1/search"))).toBe(
      false,
    );
  });

  it("shows the ranked results for a free-text query", async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.type(
      screen.getByRole("combobox", { name: "Search messages" }),
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

    const input = screen.getByRole("combobox", { name: "Search messages" });

    await user.type(input, "in:#general from:@ana rollback");

    expect(screen.getByText("in:#general")).toBeInTheDocument();
    expect(screen.getByText("from:@ana")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Remove the in filter" }),
    );

    expect(input).toHaveValue("from:@ana rollback");
    expect(screen.queryByText("in:#general")).not.toBeInTheDocument();
  });

  it("finishes a date filter from the field its row opens", async () => {
    const user = userEvent.setup();

    renderPanel();

    const input = screen.getByRole("combobox", { name: "Search messages" });

    await user.click(input);
    await user.click(screen.getByRole("option", { name: "On date" }));

    expect(input).toHaveValue("on:");

    const day = screen.getByLabelText("On date");

    expect(day).toHaveAttribute("placeholder", "YYYY-MM-DD");

    fireEvent.change(day, { target: { value: "2026-09-15" } });

    expect(input).toHaveValue("on:2026-09-15 ");
    expect(screen.getByText("on:2026-09-15")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(
      requestedUrls.find((url) => url.startsWith("/api/v1/search")),
    ).toContain(encodeURIComponent("on:2026-09-15"));
  });

  it("keeps a half-typed day out of the query and says nothing about it", async () => {
    const user = userEvent.setup();

    renderPanel();

    const input = screen.getByRole("combobox", { name: "Search messages" });

    await user.click(input);
    await user.click(screen.getByRole("option", { name: "Before date" }));

    const day = screen.getByLabelText("Before date");

    fireEvent.change(day, { target: { value: "2026-09-1" } });

    expect(day).toHaveValue("2026-09-1");
    expect(input).toHaveValue("before:");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.change(day, { target: { value: "2026-02-31" } });

    expect(input).toHaveValue("before:");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That is not a day. Use YYYY-MM-DD.",
    );

    fireEvent.change(day, { target: { value: "2026-09-15" } });

    expect(input).toHaveValue("before:2026-09-15 ");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers no standing helper line under the date control", async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.click(screen.getByRole("combobox", { name: "Search messages" }));
    await user.click(screen.getByRole("option", { name: "On date" }));

    expect(screen.getByLabelText("On date")).toHaveAttribute(
      "placeholder",
      "YYYY-MM-DD",
    );
    expect(screen.queryByText(/like 2026-09-15/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Example:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("names the date filters without spelling out their inclusivity", async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.click(screen.getByRole("combobox", { name: "Search messages" }));

    for (const name of ["On date", "Before date", "After date"]) {
      expect(screen.getByRole("option", { name })).toBeInTheDocument();
    }

    for (const wording of [
      /on and before/i,
      /on and after/i,
      /on or before/i,
      /on or after/i,
    ]) {
      expect(screen.queryByText(wording)).not.toBeInTheDocument();
    }
  });

  it("offers each filter as one line", async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.click(screen.getByRole("combobox", { name: "Search messages" }));

    expect(
      screen.getByRole("option", { name: "From user" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "In channel" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Only messages somebody wrote"),
    ).not.toBeInTheDocument();
  });

  it("sends a typed date filter as part of the query", async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.type(
      screen.getByRole("combobox", { name: "Search messages" }),
      "before:2026-09-15 rollback",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(
      requestedUrls.find((url) => url.startsWith("/api/v1/search")),
    ).toContain(encodeURIComponent("before:2026-09-15"));
    expect(screen.getByText("before:2026-09-15")).toBeInTheDocument();
  });

  it("draws no chip for a date that is not one", async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.type(
      screen.getByRole("combobox", { name: "Search messages" }),
      "on:2026-02-31 on:banana",
    );

    expect(screen.queryByText("on:2026-02-31")).not.toBeInTheDocument();
    expect(screen.queryByText("on:banana")).not.toBeInTheDocument();
  });

  it("explains a filter-only query the server had to degrade", async () => {
    const user = userEvent.setup();

    searchResponse = { ...searchResponse, degraded: true };

    renderPanel();

    await user.type(
      screen.getByRole("combobox", { name: "Search messages" }),
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
      screen.getByRole("combobox", { name: "Search messages" }),
      "rollback",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("No messages matched")).toBeInTheDocument();
  });

  it("jumps to the message the result names", async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.type(
      screen.getByRole("combobox", { name: "Search messages" }),
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
