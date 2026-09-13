import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServerList } from "@/features/servers/components/server-list";
import { useUi } from "@/stores/ui";

import { CreateServerDialog } from "./create-server-dialog";

const EXISTING = [
  {
    id: "s-1",
    name: "Analytical Engine",
    iconKey: null,
    ownerId: "u-1",
    createdAt: "2026-09-01T00:00:00.000Z",
  },
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mountRail(post: () => Response) {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockImplementation((_input, init) =>
      Promise.resolve(init?.method === "POST" ? post() : json(EXISTING)),
    );

  vi.stubGlobal("fetch", fetchMock);

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app"]}>
        <ServerList />
        <CreateServerDialog />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return fetchMock;
}

beforeEach(() => {
  useUi.setState({ activeModal: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CreateServerDialog", () => {
  it("rejects an empty name with the shared schema, before any request", async () => {
    const user = userEvent.setup();
    const fetchMock = mountRail(() => json({}, 201));

    await user.click(screen.getByRole("button", { name: "Add Server" }));
    await user.click(await screen.findByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
    });

    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(0);
  });

  it("posts the name and closes on success", async () => {
    const user = userEvent.setup();
    const fetchMock = mountRail(() =>
      json({ id: "s-2", name: "Difference Engine" }, 201),
    );

    await user.click(screen.getByRole("button", { name: "Add Server" }));
    await user.type(await screen.findByLabelText("Name"), "Difference Engine");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(useUi.getState().activeModal).toBeNull();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/servers",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Difference Engine" }),
      }),
    );
  });

  it("leaves the rail unchanged and offers a retry when the POST fails", async () => {
    const user = userEvent.setup();
    const fetchMock = mountRail(() =>
      json(
        { error: { code: "INTERNAL", message: "Internal server error" } },
        500,
      ),
    );

    expect(
      await screen.findByRole("button", { name: "Analytical Engine" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add Server" }));
    await user.type(await screen.findByLabelText("Name"), "Difference Engine");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Internal server error",
    );
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(useUi.getState().activeModal).toBe("create-server");
    expect(
      screen.queryByRole("button", { name: "Difference Engine" }),
    ).not.toBeInTheDocument();

    const posts = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );

    expect(posts).toHaveLength(1);
  });
});
