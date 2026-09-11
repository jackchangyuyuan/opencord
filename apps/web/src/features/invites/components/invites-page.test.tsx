import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InvitesPage } from "@/features/invites/components/invites-page";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const ME = "u-ada";

let permissions: number;
let invites: unknown[];

const NAMES: Record<string, string> = {
  "u-ada": "Ada",
  "u-grace": "Grace",
};

function user(id: string) {
  return {
    id,
    username: id.replace("u-", ""),
    name: NAMES[id] ?? "Somebody",
    avatarUrl: null,
    description: null,
    customStatus: null,
    customStatusEmoji: null,
    isGuest: false,
  };
}

function invite(
  code: string,
  overrides: {
    inviterId?: string;
    expiresAt?: string | null;
    maxUses?: number | null;
    uses?: number;
  } = {},
) {
  return {
    code,
    serverId: SERVER_ID,
    inviterId: overrides.inviterId ?? ME,
    maxUses: overrides.maxUses ?? null,
    uses: overrides.uses ?? 0,
    expiresAt: overrides.expiresAt ?? null,
    createdAt: "2026-09-11T10:00:00.000Z",
  };
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <InvitesPage serverId={SERVER_ID} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  permissions =
    Permissions.VIEW_CHANNEL |
    Permissions.CREATE_INVITE |
    Permissions.MANAGE_SERVER;
  invites = [];

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = url.endsWith("/users/@me")
        ? user(ME)
        : url.includes("/invites")
          ? invites
          : url.includes("/users?ids=")
            ? (new URL(url, "http://localhost").searchParams.get("ids") ?? "")
                .split(",")
                .filter(Boolean)
                .map(user)
            : url.includes("/users/")
              ? user(url.split("/users/")[1]?.split(/[?/]/)[0] ?? ME)
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
                    roles: [],
                  }
                : {};

      return Promise.resolve(new Response(JSON.stringify(body)));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InvitesPage", () => {
  it("says there are no open invites when there are none", async () => {
    renderPage();

    expect(await screen.findByText("No open invites")).toBeVisible();
  });

  it("searches by code and by the person who made it", async () => {
    const actor = userEvent.setup();

    invites = [
      invite("aaaaaaaa"),
      invite("bbbbbbbb", { inviterId: "u-grace" }),
    ];

    renderPage();

    await screen.findByText("aaaaaaaa");

    const search = screen.getByRole("combobox", {
      name: "Search invites by code or creator @username",
    });

    await actor.type(search, "bbbb");

    expect(screen.queryByText("aaaaaaaa")).not.toBeInTheDocument();

    await actor.clear(search);
    await actor.type(search, "grace");

    expect(await screen.findByText("bbbbbbbb")).toBeVisible();
    expect(screen.queryByText("aaaaaaaa")).not.toBeInTheDocument();
  });

  it("tells a link that expires from one that never does", async () => {
    const actor = userEvent.setup();

    invites = [
      invite("aaaaaaaa"),
      invite("bbbbbbbb", { expiresAt: "2099-01-01T00:00:00.000Z" }),
    ];

    renderPage();

    await screen.findByText("aaaaaaaa");

    await actor.click(screen.getByRole("button", { name: /^Expiry/ }));
    await actor.click(
      await screen.findByRole("menuitem", { name: "Never expires" }),
    );

    expect(await screen.findByText("aaaaaaaa")).toBeVisible();
    expect(screen.queryByText("bbbbbbbb")).not.toBeInTheDocument();
  });

  it("separates a filtered miss from an empty server", async () => {
    const actor = userEvent.setup();

    invites = [invite("aaaaaaaa")];

    renderPage();

    await screen.findByText("aaaaaaaa");

    await actor.type(
      screen.getByRole("combobox", {
        name: "Search invites by code or creator @username",
      }),
      "zzzz",
    );

    expect(
      await screen.findByText("No invites match these filters"),
    ).toBeVisible();
    expect(screen.queryByText("No open invites")).not.toBeInTheDocument();
  });

  it("offers revoke only where the API would allow it", async () => {
    permissions = Permissions.VIEW_CHANNEL | Permissions.CREATE_INVITE;

    invites = [
      invite("aaaaaaaa"),
      invite("bbbbbbbb", { inviterId: "u-grace" }),
    ];

    renderPage();

    await screen.findByText("aaaaaaaa");

    expect(
      screen.getByRole("button", { name: "Revoke invite aaaaaaaa" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Revoke invite bbbbbbbb" }),
    ).not.toBeInTheDocument();
  });

  it("hides the create action from somebody who cannot create one", async () => {
    permissions = Permissions.VIEW_CHANNEL;

    renderPage();

    await screen.findByText("No open invites");

    expect(
      screen.queryByRole("button", { name: "Create invite" }),
    ).not.toBeInTheDocument();
  });
});
