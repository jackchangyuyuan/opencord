import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerMemberEntry } from "@/features/members/api/queries";
import type { PublicRole } from "@/features/roles/api/queries";

import { MemberActions } from "./member-actions";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const MOD_ROLE = "22222222-2222-4222-8222-222222222222";

const ROLES: PublicRole[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    name: "@everyone",
    color: null,
    position: 0,
    permissions: Permissions.VIEW_CHANNEL,
    isDefault: true,
  },
  {
    id: MOD_ROLE,
    name: "Moderators",
    color: null,
    position: 1,
    permissions: Permissions.KICK_MEMBERS,
    isDefault: false,
  },
];

const ALL_MODERATION =
  Permissions.VIEW_CHANNEL |
  Permissions.KICK_MEMBERS |
  Permissions.BAN_MEMBERS |
  Permissions.MANAGE_ROLES;

let requests: { url: string; method: string; body: unknown }[];

function member(overrides: Partial<ServerMemberEntry> = {}): ServerMemberEntry {
  return {
    user: {
      id: "u-grace",
      username: "grace",
      name: "Grace",
      avatarUrl: null,
      description: null,
      customStatus: null,
      customStatusEmoji: null,
      isGuest: false,
    },
    nickname: null,
    joinedAt: "2026-09-11T10:00:00.000Z",
    roleIds: [],
    ...overrides,
  };
}

function renderActions({
  permissions = ALL_MODERATION,
  entry = member(),
}: {
  permissions?: number;
  entry?: ServerMemberEntry;
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <MemberActions
        member={entry}
        permissions={permissions}
        roles={ROLES}
        serverId={SERVER_ID}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  requests = [];

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      requests.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body === undefined ? null : JSON.parse(init.body),
      });

      return Promise.resolve(new Response(null, { status: 204 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MemberActions", () => {
  it("names itself Manage rather than drawing three dots", () => {
    renderActions();

    expect(
      screen.getByRole("button", { name: "Manage Grace" }),
    ).toHaveTextContent("Manage");
  });

  it("renders nothing at all for a caller who may do none of it", () => {
    const { container } = renderActions({
      permissions: Permissions.VIEW_CHANNEL,
    });

    expect(container).toBeEmptyDOMElement();
  });

  it("offers only the actions the caller actually holds", async () => {
    const user = userEvent.setup();

    renderActions({
      permissions: Permissions.VIEW_CHANNEL | Permissions.KICK_MEMBERS,
    });

    await user.click(screen.getByRole("button", { name: "Manage Grace" }));

    expect(
      await screen.findByRole("menuitem", { name: "Kick Grace" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Ban Grace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("menuitemcheckbox", { name: "Moderators" }),
    ).not.toBeInTheDocument();
  });

  it("assigns a role", async () => {
    const user = userEvent.setup();

    renderActions();

    await user.click(screen.getByRole("button", { name: "Manage Grace" }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Moderators" }),
    );

    expect(requests).toEqual([
      {
        url: `/api/v1/servers/${SERVER_ID}/members/u-grace/roles/${MOD_ROLE}`,
        method: "PUT",
        body: null,
      },
    ]);
  });

  it("stays open across several role changes", async () => {
    const user = userEvent.setup();

    renderActions({
      entry: member({ roleIds: [MOD_ROLE] }),
    });

    await user.click(screen.getByRole("button", { name: "Manage Grace" }));

    const moderators = await screen.findByRole("menuitemcheckbox", {
      name: "Moderators",
    });

    await user.click(moderators);

    expect(screen.getByRole("menu", { name: "Manage Grace" })).toBeVisible();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Moderators" }),
    ).toBeVisible();

    await user.click(
      screen.getByRole("menuitemcheckbox", { name: "Moderators" }),
    );

    expect(screen.getByRole("menu", { name: "Manage Grace" })).toBeVisible();
    expect(requests).toHaveLength(2);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();

    renderActions();

    await user.click(screen.getByRole("button", { name: "Manage Grace" }));
    await screen.findByRole("menuitemcheckbox", { name: "Moderators" });

    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("menu", { name: "Manage Grace" }),
    ).not.toBeInTheDocument();
  });

  it("unassigns a role the member already holds", async () => {
    const user = userEvent.setup();

    renderActions({ entry: member({ roleIds: [MOD_ROLE] }) });

    await user.click(screen.getByRole("button", { name: "Manage Grace" }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Moderators" }),
    );

    expect(requests[0]?.method).toBe("DELETE");
  });

  it("names the target before kicking", async () => {
    const user = userEvent.setup();

    renderActions();

    await user.click(screen.getByRole("button", { name: "Manage Grace" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Kick Grace" }),
    );

    expect(await screen.findByText("Kick Grace?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Kick" }));

    expect(requests).toEqual([
      {
        url: `/api/v1/servers/${SERVER_ID}/members/u-grace`,
        method: "DELETE",
        body: null,
      },
    ]);
  });

  it("sends the ban reason it collected", async () => {
    const user = userEvent.setup();

    renderActions();

    await user.click(screen.getByRole("button", { name: "Manage Grace" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Ban Grace" }),
    );

    await user.type(
      await screen.findByRole("textbox", { name: "Reason" }),
      "spam",
    );
    await user.click(screen.getByRole("button", { name: "Ban" }));

    expect(requests).toEqual([
      {
        url: `/api/v1/servers/${SERVER_ID}/bans/u-grace`,
        method: "PUT",
        body: { reason: "spam" },
      },
    ]);
  });

  it("lets the user back out of a destructive action", async () => {
    const user = userEvent.setup();

    renderActions();

    await user.click(screen.getByRole("button", { name: "Manage Grace" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Kick Grace" }),
    );
    await screen.findByText("Kick Grace?");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(requests).toEqual([]);
  });
});

describe("the API is the authority", () => {
  it("still refuses when the affordance is bypassed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: "ROLE_HIERARCHY", message: "Not above you" },
            }),
            { status: 403 },
          ),
        ),
      ),
    );

    const user = userEvent.setup();

    renderActions();

    await user.click(screen.getByRole("button", { name: "Manage Grace" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Kick Grace" }),
    );
    await screen.findByText("Kick Grace?");
    await user.click(screen.getByRole("button", { name: "Kick" }));

    await user.click(screen.getByRole("button", { name: "Manage Grace" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Ban Grace" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Not above you");
  });
});
