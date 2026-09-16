import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BansPage } from "@/features/members/components/bans-page";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const ME = "u-ada";

let permissions: number;
let bans: unknown[];

function user(id: string, name: string) {
  return {
    id,
    username: name.toLowerCase(),
    name,
    avatarUrl: null,
    description: null,
    customStatus: null,
    customStatusEmoji: null,
    isGuest: false,
  };
}

function ban(
  id: string,
  name: string,
  overrides: { reason?: string | null; bannedBy?: string } = {},
) {
  return {
    user: user(id, name),
    reason: overrides.reason ?? null,
    bannedBy: overrides.bannedBy ?? "u-ada",
    createdAt: "2026-09-11T10:00:00.000Z",
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <BansPage serverId={SERVER_ID} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  permissions = Permissions.VIEW_CHANNEL | Permissions.BAN_MEMBERS;
  bans = [];

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = url.endsWith("/users/@me")
        ? user(ME, "Ada")
        : url.includes("/bans")
          ? bans
          : url.includes("/users/")
            ? user(url.split("/users/")[1]?.split(/[?/]/)[0] ?? "u-ada", "Ada")
            : url.endsWith(`/servers/${SERVER_ID}`)
              ? {
                  id: SERVER_ID,
                  name: "Analytical Engine",
                  description: null,
                  iconKey: null,
                  iconUrl: null,
                  ownerId: "somebody-else",
                  createdAt: "2026-09-11T10:00:00.000Z",
                  everyoneRole: {
                    id: "r-everyone",
                    name: "@everyone",
                    color: null,
                    position: 0,
                    permissions,
                    isDefault: true,
                  },
                  viewerRoles: [],
                }
              : {};

      return Promise.resolve(new Response(JSON.stringify(body)));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BansPage", () => {
  it("tells a server with no bans from a filter that matched none", async () => {
    const actor = userEvent.setup();

    bans = [ban("u-grace", "Grace")];

    renderPage();

    await screen.findByText("Grace");

    await actor.type(
      screen.getByRole("combobox", {
        name: "Search bans by @username, name or reason",
      }),
      "zzz",
    );

    expect(
      await screen.findByText("No bans match these filters"),
    ).toBeVisible();
    expect(
      screen.queryByText("This server has no banned users"),
    ).not.toBeInTheDocument();
  });

  it("says the server has no banned users when it has none", async () => {
    renderPage();

    expect(
      await screen.findByText("This server has no banned users"),
    ).toBeVisible();
  });

  it("searches the banned person and the reason alike", async () => {
    const actor = userEvent.setup();

    bans = [
      ban("u-grace", "Grace", { reason: "spam" }),
      ban("u-hopper", "Hopper"),
    ];

    renderPage();

    await screen.findByText("Grace");

    const search = screen.getByRole("combobox", {
      name: "Search bans by @username, name or reason",
    });

    await actor.type(search, "hopper");

    expect(screen.queryByText("Grace")).not.toBeInTheDocument();
    expect(screen.getByText("Hopper")).toBeVisible();

    await actor.clear(search);
    await actor.type(search, "spam");

    expect(await screen.findByText("Grace")).toBeVisible();
    expect(screen.queryByText("Hopper")).not.toBeInTheDocument();
  });

  it("narrows to the bans that carry a reason", async () => {
    const actor = userEvent.setup();

    bans = [
      ban("u-grace", "Grace", { reason: "spam" }),
      ban("u-hopper", "Hopper"),
    ];

    renderPage();

    await screen.findByText("Grace");

    await actor.click(screen.getByRole("button", { name: /^Reason/ }));
    await actor.click(
      await screen.findByRole("menuitem", { name: "No reason given" }),
    );

    expect(await screen.findByText("Hopper")).toBeVisible();
    expect(screen.queryByText("Grace")).not.toBeInTheDocument();

    await actor.click(
      screen.getByRole("button", { name: "Remove filter No reason" }),
    );

    expect(await screen.findByText("Grace")).toBeVisible();
  });

  it("offers no unban and no instruction without BAN_MEMBERS", async () => {
    permissions = Permissions.VIEW_CHANNEL;
    bans = [ban("u-grace", "Grace")];

    renderPage();

    await screen.findByText("Grace");

    expect(
      screen.queryByRole("button", { name: /^Unban/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the instruction out of the empty state for a reader", async () => {
    permissions = Permissions.VIEW_CHANNEL;

    renderPage();

    await screen.findByText("This server has no banned users");

    expect(
      screen.queryByText(/Ban somebody from the Members page/),
    ).not.toBeInTheDocument();
  });

  it("confirms before lifting a ban", async () => {
    const actor = userEvent.setup();

    bans = [ban("u-grace", "Grace")];

    renderPage();

    await actor.click(
      await screen.findByRole("button", { name: "Unban Grace" }),
    );

    expect(
      await screen.findByText("Lift the ban on Grace?"),
    ).toBeInTheDocument();
  });
});
