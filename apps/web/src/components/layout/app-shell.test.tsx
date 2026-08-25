import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUi } from "@/stores/ui";

import { AppShell } from "./app-shell";

function renderShell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app"]}>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function stubViewport(mobile: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList =>
      ({
        matches: mobile,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

beforeEach(() => {
  useUi.setState({ mobileDrawerOpen: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppShell", () => {
  it("declares one of each landmark", () => {
    stubViewport(false);

    renderShell();

    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(screen.getAllByRole("complementary")).toHaveLength(1);
  });

  it("orders the headings h1 then h2, with no level skipped", () => {
    stubViewport(false);

    renderShell();

    const levels = screen
      .getAllByRole("heading")
      .map((heading) => Number(heading.tagName.slice(1)));

    expect(levels[0]).toBe(1);
    expect(levels.slice(1).every((level) => level === 2)).toBe(true);
  });

  it("names the three regions the navigation covers", () => {
    stubViewport(false);

    renderShell();

    const navigation = screen.getByRole("navigation");

    expect(
      within(navigation).getByRole("heading", { name: "Servers" }),
    ).toBeInTheDocument();
    expect(
      within(navigation).getByRole("heading", { name: "Channels" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Members" }),
    ).toBeInTheDocument();
  });

  it("moves the navigation into a drawer on a narrow viewport", async () => {
    const user = userEvent.setup();

    stubViewport(true);

    renderShell();

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open navigation" }));

    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByRole("navigation")).toBeInTheDocument();
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
  });

  it("closes the drawer on Escape", async () => {
    const user = userEvent.setup();

    stubViewport(true);

    renderShell();

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(useUi.getState().mobileDrawerOpen).toBe(false);
  });

  it("takes everything outside the open drawer out of reach", async () => {
    const user = userEvent.setup();

    stubViewport(true);

    renderShell();

    expect(screen.getByRole("button", { name: "Dark" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await screen.findByRole("dialog");

    expect(
      screen.queryByRole("button", { name: "Dark" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open navigation" }),
    ).not.toBeInTheDocument();
  });
});
