import { Permissions } from "@opencord/shared/permissions";
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

const GENERAL = channel("c-general", "general", 0);
const RANDOM = channel("c-random", "random", 1);

const CHANNELS = [GENERAL, RANDOM];

const VIEWER_ID = "u-viewer";

const SERVER_DETAIL = {
  id: SERVER_ID,
  name: "Analytical Engine",
  iconUrl: null,
  ownerId: "u-owner",
  everyoneRole: {
    id: "r-everyone",
    name: "@everyone",
    color: null,
    position: 0,
    permissions: Permissions.VIEW_CHANNEL,
    isDefault: true,
  },
  viewerRoles: [],
};

function stubFetch(
  body: unknown,
  status = 200,
  server: unknown = SERVER_DETAIL,
) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const channels = url.endsWith("/channels");

    const payload = channels
      ? body
      : url.endsWith("/users/@me")
        ? { id: VIEWER_ID }
        : server;

    return Promise.resolve(
      new Response(JSON.stringify(payload), {
        status: channels ? status : 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function renderList(path: string, serverId: string | undefined = SERVER_ID) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  client.setQueryData(["users", "@me"], { id: VIEWER_ID });

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
    const fetchMock = stubFetch([GENERAL]);

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

  it("offers no drag handle without the bit to manage channels", async () => {
    stubFetch(CHANNELS);

    renderList("/app");

    await screen.findByRole("link", { name: "general" });

    expect(
      screen.queryByRole("button", { name: /^Reorder / }),
    ).not.toBeInTheDocument();
  });

  it("offers a drag handle per channel to somebody who may manage them", async () => {
    stubFetch(CHANNELS, 200, { ...SERVER_DETAIL, ownerId: VIEWER_ID });

    renderList("/app");

    expect(
      await screen.findByRole("button", { name: "Reorder general" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reorder random" }),
    ).toBeInTheDocument();
  });

  it("puts unread state and the row controls in one lane at one width", async () => {
    stubFetch(
      [
        {
          ...GENERAL,
          hasUnread: true,
          hasEveryone: false,
          mentionCount: 0,
          unreadCount: 3,
          lastReadMessageId: null,
        },
        {
          ...RANDOM,
          hasUnread: true,
          hasEveryone: false,
          mentionCount: 128,
          unreadCount: 128,
          lastReadMessageId: null,
        },
      ],
      200,
      { ...SERVER_DETAIL, ownerId: VIEWER_ID },
    );

    renderList("/app");

    const plain = await screen.findByRole("link", { name: /general/ });

    const dotLane = screen.getByTestId(`channel-unread-${GENERAL.id}`);
    const pillLane = screen.getByTestId(`channel-unread-${RANDOM.id}`);

    expect(dotLane).toHaveClass("w-13", "justify-center");
    expect(pillLane).toHaveClass("w-13", "justify-center");

    expect(dotLane).toHaveClass(
      "group-hover/channel:opacity-0",
      "group-focus-within/channel:opacity-0",
    );
    expect(plain).toHaveAccessibleName(/unread messages/);

    expect(screen.getByRole("button", { name: "Edit general" })).toHaveClass(
      "group-hover/channel:opacity-100",
      "group-focus-within/channel:opacity-100",
    );
  });

  it("gives the Edit control an accessible name and no tooltip", async () => {
    stubFetch(CHANNELS, 200, { ...SERVER_DETAIL, ownerId: VIEWER_ID });

    renderList("/app");

    const edit = await screen.findByRole("button", { name: "Edit general" });

    expect(edit).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("keeps the lane on a row whose controls are absent", async () => {
    stubFetch(CHANNELS);

    renderList("/app");

    await screen.findByRole("link", { name: "general" });

    const lane = screen.getByTestId(`channel-unread-${GENERAL.id}`);

    expect(lane).toHaveClass("w-13", "justify-center");
    expect(lane).not.toHaveClass("group-hover/channel:opacity-0");
  });

  it("reports a failed load instead of pretending the server has no channels", async () => {
    stubFetch({ error: { code: "FORBIDDEN", message: "Forbidden" } }, 403);

    renderList("/app");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load channels.",
    );
  });
});
