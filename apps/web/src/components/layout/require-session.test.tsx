import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RequireSession } from "./require-session";

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<{ data: unknown; error: unknown }>>(),
}));

vi.mock("@/lib/auth-client", () => ({ authClient: { getSession } }));

function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<p>landing</p>} path="/" />
          <Route
            element={
              <RequireSession>
                <p>the application</p>
              </RequireSession>
            }
            path="/app"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getSession.mockReset();
});

describe("RequireSession", () => {
  it("sends a visitor without a session back to the landing page", async () => {
    getSession.mockResolvedValue({ data: null, error: null });

    renderAt("/app");

    expect(await screen.findByText("landing")).toBeInTheDocument();
    expect(screen.queryByText("the application")).not.toBeInTheDocument();
  });

  it("renders the gated subtree once a session resolves", async () => {
    getSession.mockResolvedValue({
      data: { user: { id: "u1", username: "ada" }, session: { id: "s1" } },
      error: null,
    });

    renderAt("/app");

    expect(await screen.findByText("the application")).toBeInTheDocument();
  });

  it("keeps a visitor in place when the session cannot be read", async () => {
    getSession.mockResolvedValue({
      data: null,
      error: { message: "Service unavailable" },
    });

    renderAt("/app");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not check your session/i,
    );
    expect(screen.queryByText("landing")).not.toBeInTheDocument();
    expect(screen.queryByText("the application")).not.toBeInTheDocument();
  });

  it("recovers the gated subtree once the session can be read again", async () => {
    getSession
      .mockResolvedValueOnce({ data: null, error: { message: "down" } })
      .mockResolvedValue({
        data: { user: { id: "u1", username: "ada" }, session: { id: "s1" } },
        error: null,
      });

    renderAt("/app");

    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );

    expect(await screen.findByText("the application")).toBeInTheDocument();
  });

  it("announces the pending state instead of flashing the landing page", () => {
    getSession.mockReturnValue(new Promise(() => undefined));

    renderAt("/app");

    expect(screen.getByText("Signing you in…")).toBeInTheDocument();
  });
});
