import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LandingPage } from "./landing-page";

const SCENARIO = {
  userId: "u-guest",
  serverCount: 3,
  sandboxId: "s-sandbox",
  landingChannelId: "c-general",
};

interface FakeSession {
  user: { id: string };
}

const session = vi.hoisted(() => ({ value: null as FakeSession | null }));

vi.mock("@/features/auth/hooks/use-session", () => ({
  useSession: () => ({ session: session.value, isPending: false }),
}));

function stubFetch(status = 201, body: unknown = SCENARIO) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function renderLanding() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<LandingPage />} path="/" />
          <Route element={<p>the application</p>} path="/app/channels/:id" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  session.value = null;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LandingPage", () => {
  it("offers one button above the fold and six bullets below it", () => {
    stubFetch();

    renderLanding();

    expect(
      screen.getByRole("button", { name: "Enter demo — no signup" }),
    ).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });

  it("does not provision anybody until the button is pressed", () => {
    const fetchMock = stubFetch();

    renderLanding();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enters the demo in one click and lands in a channel", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch();

    renderLanding();

    await user.click(
      screen.getByRole("button", { name: "Enter demo — no signup" }),
    );

    expect(await screen.findByText("the application")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/demo/guest",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reports a refusal instead of stranding the visitor", async () => {
    const user = userEvent.setup();

    stubFetch(429, {
      error: { code: "RATE_LIMITED", message: "Too many requests, slow down" },
    });

    renderLanding();

    await user.click(
      screen.getByRole("button", { name: "Enter demo — no signup" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Too many requests, slow down",
      );
    });
  });

  it("sends a signed-in visitor straight to the app", () => {
    session.value = { user: { id: "u-ada" } };
    stubFetch();

    renderLanding();

    expect(screen.getByRole("link", { name: "Open the app" })).toHaveAttribute(
      "href",
      "/app",
    );
    expect(
      screen.queryByRole("button", { name: "Enter demo — no signup" }),
    ).not.toBeInTheDocument();
  });

  it("shows the two-window loop", () => {
    stubFetch();

    renderLanding();

    expect(
      screen.getByRole("img", {
        name: "Two windows staying in sync as a message is sent",
      }),
    ).toBeVisible();
    expect(screen.getByText("Window A")).toBeVisible();
    expect(screen.getByText("Window B")).toBeVisible();
  });
});
