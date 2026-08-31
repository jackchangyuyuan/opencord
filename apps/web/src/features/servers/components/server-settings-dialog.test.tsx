import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUi } from "@/stores/ui";

import { ServerSettingsDialog } from "./server-settings-dialog";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const ME = "u-ada";

let everyonePermissions: number;
let ownerId: string;

function summary() {
  return {
    id: SERVER_ID,
    name: "Analytical Engine",
    iconKey: null,
    ownerId,
    createdAt: "2026-09-11T10:00:00.000Z",
  };
}

function detail() {
  return {
    ...summary(),
    everyoneRole: {
      id: "r-everyone",
      name: "@everyone",
      color: null,
      permissions: everyonePermissions,
      position: 0,
      isDefault: true,
    },
    roles: [],
  };
}

function seed(client: QueryClient) {
  client.setQueryData(["users", "@me"], {
    id: ME,
    username: "ada",
    name: "Ada",
    avatarUrl: null,
  });

  client.setQueryData(["servers"], [summary()]);
  client.setQueryData(["servers", SERVER_ID], detail());
}

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  seed(client);

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app"]}>
        <ServerSettingsDialog serverId={SERVER_ID} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  everyonePermissions = Permissions.VIEW_CHANNEL | Permissions.MANAGE_SERVER;
  ownerId = ME;

  useUi.setState({ activeModal: null });

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.endsWith("/members/@me")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: "OWNER_MUST_TRANSFER",
                message: "Transfer ownership before leaving this server",
              },
            }),
            { status: 409 },
          ),
        );
      }

      if (url.endsWith("/users/@me")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: ME,
              username: "ada",
              name: "Ada",
              avatarUrl: null,
            }),
          ),
        );
      }

      const body = url.includes("/members")
        ? { data: [], nextCursor: null }
        : url.endsWith(`/servers/${SERVER_ID}`)
          ? detail()
          : url.endsWith("/servers")
            ? [summary()]
            : {};

      return Promise.resolve(new Response(JSON.stringify(body)));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ServerSettingsDialog", () => {
  it("opens a settings screen with a working tab shell", async () => {
    const user = userEvent.setup();

    renderDialog();

    await user.click(screen.getByRole("button", { name: "Server settings" }));

    expect(
      await screen.findByRole("tab", { name: "Overview" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Server name" })).toHaveValue(
      "Analytical Engine",
    );
  });

  it("hides the rename form from a member without MANAGE_SERVER", async () => {
    const user = userEvent.setup();

    everyonePermissions = Permissions.VIEW_CHANNEL;
    ownerId = "u-grace";

    renderDialog();

    await user.click(screen.getByRole("button", { name: "Server settings" }));
    await screen.findByRole("tab", { name: "Overview" });

    expect(
      screen.queryByRole("textbox", { name: "Server name" }),
    ).not.toBeInTheDocument();
  });

  it("offers the transfer form inline when the owner tries to leave", async () => {
    const user = userEvent.setup();

    renderDialog();

    await user.click(screen.getByRole("button", { name: "Server settings" }));
    await screen.findByRole("tab", { name: "Overview" });

    await user.click(screen.getByRole("button", { name: "Leave server" }));

    expect(
      await screen.findByText(
        "You own this server. Hand it to another member before you leave.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("combobox", { name: "Transfer ownership to" }).length,
    ).toBeGreaterThan(0);
  });

  it("shows no transfer form to a member who is not the owner", async () => {
    const user = userEvent.setup();

    ownerId = "u-grace";

    renderDialog();

    await user.click(screen.getByRole("button", { name: "Server settings" }));
    await screen.findByRole("tab", { name: "Overview" });

    expect(
      screen.queryByRole("combobox", { name: "Transfer ownership to" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete server" }),
    ).not.toBeInTheDocument();
  });
});
