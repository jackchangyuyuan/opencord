import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChannelSummary } from "@/features/channels/api/queries";

import { ChannelList } from "./channel-list";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";

function channel(id: string, name: string, position: number): ChannelSummary {
  return {
    id,
    serverId: SERVER_ID,
    type: "text",
    name,
    topic: null,
    position,
    lastMessageId: null,
    lastEveryoneMentionId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

const CHANNELS = [
  channel("c-general", "general", 0),
  channel("c-random", "random", 1),
];

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

function renderList(path: string, serverId: string | undefined = SERVER_ID) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<ChannelList serverId={serverId} />} path="/app" />
          <Route
            element={<ChannelList serverId={serverId} />}
            path="/app/channels/:channelId"
          />
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

describe("ChannelList", () => {
  it("renders exactly the channels the server returned, in order", async () => {
    stubFetch(CHANNELS);

    renderList("/app");

    const links = await screen.findAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual([
      "general",
      "random",
    ]);
  });

  it("does not filter by permission — it renders what it is given", async () => {
    const fetchMock = stubFetch([CHANNELS[0]]);

    renderList("/app");

    expect(await screen.findByRole("link", { name: "general" })).toBeVisible();
    expect(
      screen.queryByRole("link", { name: "random" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/servers/${SERVER_ID}/channels`,
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("marks the routed channel as the current page", async () => {
    stubFetch(CHANNELS);

    renderList("/app/channels/c-random");

    const active = await screen.findByRole("link", { name: "random" });

    expect(active).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "general" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("shows skeletons rather than an empty list until a server is chosen", () => {
    stubFetch(CHANNELS);

    renderList("/app", undefined);

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("reports a failed load instead of pretending the server has no channels", async () => {
    stubFetch({ error: { code: "FORBIDDEN", message: "Forbidden" } }, 403);

    renderList("/app");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load channels.",
    );
  });
});
