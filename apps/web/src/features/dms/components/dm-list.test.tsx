import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DmEntry } from "@/features/dms/api/queries";

import { DmList } from "./dm-list";

function dm(id: string, name: string, hasUnread: boolean): DmEntry {
  return {
    id,
    serverId: null,
    type: "dm",
    name: null,
    topic: null,
    position: 0,
    lastMessageId: null,
    lastEveryoneMentionId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    lastReadMessageId: null,
    hasUnread,
    hasEveryone: false,
    mentionCount: 0,
    recipient: {
      id: `u-${name}`,
      username: name.toLowerCase(),
      name,
      avatarUrl: null,
      description: null,
      customStatus: null,
      customStatusEmoji: null,
      isGuest: false,
    },
  };
}

const DMS = [dm("d-grace", "Grace", true), dm("d-alan", "Alan", false)];

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function renderList(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<DmList />} path="/app/dms" />
          <Route element={<DmList />} path="/app/channels/:channelId" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DmList", () => {
  it("names each conversation by its counterpart", async () => {
    const fetchMock = stubFetch(DMS);

    renderList("/app/dms");

    const links = await screen.findAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Grace"),
      expect.stringContaining("Alan"),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/dms",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("marks the routed conversation as the current page", async () => {
    stubFetch(DMS);

    renderList("/app/channels/d-alan");

    const active = await screen.findByRole("link", { name: /Alan/ });

    expect(active).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Grace/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("carries the same unread badge a channel row does", async () => {
    stubFetch(DMS);

    renderList("/app/dms");

    expect(
      await screen.findByText("Grace: unread messages"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Alan: unread messages")).not.toBeInTheDocument();
  });

  it("points at the member list when there is nothing yet", async () => {
    stubFetch([]);

    renderList("/app/dms");

    expect(
      await screen.findByText(/Open one from a member list/),
    ).toBeVisible();
  });

  it("reports a failure rather than rendering an empty list", async () => {
    stubFetch({ error: { code: "OFFLINE", message: "no" } }, 503);

    renderList("/app/dms");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load direct messages.",
    );
  });
});
