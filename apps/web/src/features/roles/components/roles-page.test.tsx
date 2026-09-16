import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RolesPage } from "@/features/roles/components/roles-page";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const ME = "u-ada";

const MOD_ROLE = "22222222-2222-4222-8222-222222222222";
const ARCHIVE_ROLE = "33333333-3333-4333-8333-333333333333";

let permissions: number;
let ownerId: string;

function roles() {
  return [
    {
      id: "r-everyone",
      name: "@everyone",
      color: null,
      position: 0,
      permissions,
      isDefault: true,
      memberCount: 4,
    },
    {
      id: MOD_ROLE,
      name: "Moderators",
      color: 0x3b82f6,
      position: 1,
      permissions: Permissions.KICK_MEMBERS,
      isDefault: false,
      memberCount: 2,
    },
    {
      id: ARCHIVE_ROLE,
      name: "Archivists",
      color: null,
      position: 2,
      permissions: 0,
      isDefault: false,
      memberCount: 1,
    },
  ];
}

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  client.setQueryData(["users", "@me"], {
    id: ME,
    username: "ada",
    name: "Ada",
    avatarUrl: null,
    description: null,
    customStatus: null,
    customStatusEmoji: null,
    isGuest: false,
  });

  return render(
    <QueryClientProvider client={client}>
      <RolesPage serverId={SERVER_ID} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  permissions = Permissions.VIEW_CHANNEL | Permissions.MANAGE_ROLES;
  ownerId = ME;

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = url.endsWith("/users/@me")
        ? {
            id: ME,
            username: "ada",
            name: "Ada",
            avatarUrl: null,
            description: null,
            customStatus: null,
            customStatusEmoji: null,
            isGuest: false,
          }
        : url.includes("/roles")
          ? roles()
          : url.endsWith(`/servers/${SERVER_ID}`)
            ? {
                id: SERVER_ID,
                name: "Analytical Engine",
                description: null,
                iconKey: null,
                iconUrl: null,
                ownerId,
                createdAt: "2026-09-11T10:00:00.000Z",
                everyoneRole: roles()[0],
                viewerRoles: [],
              }
            : url.includes("/overwrites")
              ? { roles: [], members: [] }
              : url.includes("/channels")
                ? [
                    {
                      id: "c-general",
                      serverId: SERVER_ID,
                      type: "text",
                      name: "general",
                      topic: null,
                      position: 0,
                      lastMessageId: null,
                      lastEveryoneMentionId: null,
                      createdAt: "2026-09-11T10:00:00.000Z",
                      lastReadMessageId: null,
                      hasUnread: false,
                      hasEveryone: false,
                      mentionCount: 0,
                      unreadCount: 0,
                    },
                  ]
                : {};

      return Promise.resolve(new Response(JSON.stringify(body)));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openPage() {
  const user = userEvent.setup();

  renderPage();

  await screen.findByRole("list", { name: "Roles" });

  return user;
}

describe("RolesPage", () => {
  it("lists every role with the number of people wearing it", async () => {
    await openPage();

    const list = screen.getByRole("list", { name: "Roles" });
    const rows = within(list).getAllByRole("listitem");

    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("Moderators");
    expect(rows[1]).toHaveTextContent("2");
  });

  it("narrows the list by name and says so when nothing matches", async () => {
    const user = await openPage();

    const search = screen.getByRole("searchbox", {
      name: "Search roles by name",
    });

    await user.type(search, "arch");

    expect(
      within(screen.getByRole("list", { name: "Roles" })).getAllByRole(
        "listitem",
      ),
    ).toHaveLength(1);

    await user.clear(search);
    await user.type(search, "zzz");

    expect(await screen.findByText(/No roles match/)).toBeVisible();
  });

  it("withdraws the drag handles while the list is filtered", async () => {
    const user = await openPage();

    expect(
      await screen.findByRole("button", { name: "Reorder Moderators" }),
    ).toBeInTheDocument();

    await user.type(
      screen.getByRole("searchbox", { name: "Search roles by name" }),
      "mod",
    );

    expect(
      screen.queryByRole("button", { name: "Reorder Moderators" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText("Clear the search to reorder roles."),
    ).toBeVisible();
  });

  it("never offers to reorder @everyone", async () => {
    await openPage();

    await screen.findByRole("button", { name: "Reorder Moderators" });

    expect(
      screen.queryByRole("button", { name: "Reorder @everyone" }),
    ).not.toBeInTheDocument();
  });

  it("offers neither dragging nor a new role without Manage roles", async () => {
    permissions = Permissions.VIEW_CHANNEL;
    ownerId = "somebody-else";

    await openPage();

    expect(
      screen.queryByRole("button", { name: "Reorder Moderators" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "New role" }),
    ).not.toBeInTheDocument();
  });

  it("keeps channel overrides inside the selected role", async () => {
    const user = await openPage();

    await user.click(screen.getByRole("button", { name: /^Moderators/ }));
    await user.click(screen.getByRole("tab", { name: "Channels" }));

    expect(
      await screen.findByRole("list", {
        name: "Channel overrides for Moderators",
      }),
    ).toBeVisible();
  });

  it("names a role's colour rather than printing the stored number", async () => {
    const user = await openPage();

    await user.click(screen.getByRole("button", { name: /^Moderators/ }));

    const colour = await screen.findByLabelText("Colour");

    expect(colour).toHaveTextContent("Blue");
    expect(colour).not.toHaveTextContent(String(0x3b82f6));
  });

  it("agrees the deletion copy with the number of members", async () => {
    const user = await openPage();

    await user.click(screen.getByRole("button", { name: /^Moderators/ }));
    await user.click(screen.getByRole("button", { name: "Delete role" }));

    expect(
      await screen.findByText(/2 members will lose this role/),
    ).toBeInTheDocument();
  });

  it("uses the singular noun for a role held by one person", async () => {
    const user = await openPage();

    await user.click(screen.getByRole("button", { name: /^Archivists/ }));
    await user.click(screen.getByRole("button", { name: "Delete role" }));

    expect(
      await screen.findByText(/1 member will lose this role/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/1 members will lose/)).not.toBeInTheDocument();
  });

  it("counts the hierarchy among rankable roles, not the floor", async () => {
    const user = await openPage();

    await user.click(screen.getByRole("button", { name: /^Archivists/ }));

    expect(await screen.findByText(/outranks 1 of 1 role/)).toBeInTheDocument();
  });
});
