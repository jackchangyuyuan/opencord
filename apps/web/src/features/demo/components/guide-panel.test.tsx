import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UI_STORAGE_KEY, useUi } from "@/stores/ui";

import { GuidePanel } from "./guide-panel";

const SANDBOX = {
  id: "s-sandbox",
  name: "Your sandbox",
  iconKey: null,
  iconUrl: null,
  ownerId: "u-guest",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const CHANNELS = [
  {
    id: "c-general",
    serverId: SANDBOX.id,
    type: "text",
    name: "general",
    topic: null,
    position: 0,
    lastMessageId: null,
    lastEveryoneMentionId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    lastReadMessageId: null,
    hasUnread: false,
    hasEveryone: false,
    mentionCount: 0,
  },
];

const session = vi.hoisted(() => ({ anonymous: true }));

vi.mock("@/features/auth/hooks/use-session", () => ({
  useSession: () => ({
    session: { user: { id: "u-guest", isAnonymous: session.anonymous } },
    user: { id: "u-guest", isAnonymous: session.anonymous },
    isPending: false,
  }),
}));

function stubFetch() {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();

    const body = url.includes("/channels") ? CHANNELS : [SANDBOX];

    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/channels/c-elsewhere"]}>
        <Routes>
          <Route element={<GuidePanel />} path="/app/channels/:channelId" />
          <Route
            element={
              <>
                <GuidePanel />
                <p>the sandbox</p>
              </>
            }
            path="/app/channels/c-general"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  session.anonymous = true;
  localStorage.removeItem(UI_STORAGE_KEY);
  useUi.setState({ demoPanelDismissed: false, rightPanel: "members" });
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GuidePanel", () => {
  it("lists the seven actions to a guest", async () => {
    renderPanel();

    expect(
      await screen.findByRole("complementary", { name: "Try these" }),
    ).toBeVisible();

    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.textContent !== ""),
    ).toHaveLength(7);
  });

  it("shows nothing to a registered visitor", () => {
    session.anonymous = false;

    renderPanel();

    expect(
      screen.queryByRole("complementary", { name: "Try these" }),
    ).not.toBeInTheDocument();
  });

  it("tiles a second window at explicit dimensions", async () => {
    const user = userEvent.setup();
    const open = vi.fn();

    vi.stubGlobal("open", open);
    stubFetch();

    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: /Open a second window/ }),
    );

    expect(open).toHaveBeenCalledWith(
      "/app/channels/c-elsewhere",
      "opencord-second-window",
      expect.stringContaining("width="),
    );
  });

  it("swings the right panel over to search", async () => {
    const user = userEvent.setup();

    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: /Search the archive/ }),
    );

    expect(useUi.getState().rightPanel).toBe("search");
  });

  it("navigates into the sandbox", async () => {
    const user = userEvent.setup();

    renderPanel();

    const action = await screen.findByRole("button", {
      name: /Open your sandbox server/,
    });

    await waitFor(() => {
      expect(action).toBeEnabled();
    });

    await user.click(action);

    expect(await screen.findByText("the sandbox")).toBeVisible();
  });

  it("stays dismissed across a reload", async () => {
    const user = userEvent.setup();

    const { unmount } = renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "Dismiss the demo guide" }),
    );

    expect(
      screen.queryByRole("complementary", { name: "Try these" }),
    ).not.toBeInTheDocument();

    expect(localStorage.getItem(UI_STORAGE_KEY)).toContain(
      '"demoPanelDismissed":true',
    );

    unmount();
  });

  it("is reachable from the keyboard", async () => {
    const user = userEvent.setup();

    renderPanel();

    await screen.findByRole("complementary", { name: "Try these" });

    await user.tab();

    expect(
      screen.getByRole("button", { name: "Dismiss the demo guide" }),
    ).toHaveFocus();

    await user.tab();

    expect(
      screen.getByRole("button", { name: /Open a second window/ }),
    ).toHaveFocus();
  });
});
