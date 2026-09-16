import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
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
    description: null,
    iconKey: null,
    iconUrl: null,
    ownerId,
    createdAt: "2026-09-11T10:00:00.000Z",
  };
}

const EVERYONE = {
  id: "r-everyone",
  name: "@everyone",
  color: null,
  position: 0,
  isDefault: true,
};

function detail() {
  return {
    ...summary(),
    everyoneRole: { ...EVERYONE, permissions: everyonePermissions },
    viewerRoles: [],
  };
}

function roles() {
  return [
    { ...EVERYONE, permissions: everyonePermissions, memberCount: 3 },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Moderators",
      color: 0x3b82f6,
      position: 1,
      permissions: Permissions.KICK_MEMBERS,
      isDefault: false,
      memberCount: 1,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "Archivists",
      color: null,
      position: 2,
      permissions: 0,
      isDefault: false,
      memberCount: 0,
    },
  ];
}

function member(id: string, name: string) {
  return {
    user: {
      id,
      username: name.toLowerCase(),
      name,
      avatarUrl: null,
      description: null,
      customStatus: null,
      customStatusEmoji: null,
      isGuest: false,
    },
    nickname: null,
    joinedAt: "2026-09-11T10:00:00.000Z",
    roleIds: [],
  };
}

function renderDialog() {
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
  client.setQueryData(["servers"], [summary()]);
  client.setQueryData(["servers", SERVER_ID], detail());

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app"]}>
        <ServerSettingsDialog serverId={SERVER_ID} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function open() {
  const user = userEvent.setup();

  renderDialog();

  await user.click(screen.getByRole("button", { name: "Server settings" }));

  return user;
}

function nav() {
  return screen.getByRole("navigation", { name: "Server settings" });
}

beforeEach(() => {
  everyonePermissions =
    Permissions.VIEW_CHANNEL |
    Permissions.MANAGE_SERVER |
    Permissions.MANAGE_ROLES |
    Permissions.CREATE_INVITE;
  ownerId = ME;

  useUi.setState({ activeModal: null });

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const body = url.includes("/audit-log/people")
        ? []
        : url.includes("/audit-log")
          ? { data: [], nextCursor: null }
          : url.includes("/roles")
            ? roles()
            : url.includes("/bans")
              ? []
              : url.includes("/invites")
                ? []
                : url.includes("/channels")
                  ? []
                  : url.includes("/members")
                    ? {
                        data: [member(ME, "Ada"), member("u-grace", "Grace")],
                        nextCursor: null,
                      }
                    : url.endsWith(`/servers/${SERVER_ID}`)
                      ? detail()
                      : url.endsWith("/servers")
                        ? [summary()]
                        : url.endsWith("/users/@me")
                          ? {
                              id: ME,
                              username: "ada",
                              name: "Ada",
                              avatarUrl: null,
                            }
                          : {};

      return Promise.resolve(new Response(JSON.stringify(body)));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ServerSettingsDialog", () => {
  it("groups the six pages under Server and Moderation", async () => {
    await open();

    const groups = within(nav()).getAllByRole("heading");

    expect(groups.map((heading) => heading.textContent)).toEqual([
      "Server",
      "Moderation",
    ]);

    for (const label of [
      "Overview",
      "Roles",
      "Members",
      "Invites",
      "Bans",
      "Audit log",
    ]) {
      expect(within(nav()).getByRole("button", { name: label })).toBeVisible();
    }
  });

  it("keeps the sidebar where it was when the page changes", async () => {
    const user = await open();

    const before = within(nav())
      .getByRole("button", { name: "Bans" })
      .getBoundingClientRect().top;

    await user.click(within(nav()).getByRole("button", { name: "Members" }));
    await screen.findByRole("heading", { name: /Members/ });

    expect(
      within(nav())
        .getByRole("button", { name: "Bans" })
        .getBoundingClientRect().top,
    ).toBe(before);
  });

  it("marks the open page as current", async () => {
    const user = await open();

    expect(
      within(nav()).getByRole("button", { name: "Overview" }),
    ).toHaveAttribute("aria-current", "page");

    await user.click(within(nav()).getByRole("button", { name: "Roles" }));

    expect(
      within(nav()).getByRole("button", { name: "Roles" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(nav()).getByRole("button", { name: "Overview" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("hides the pages this member's permissions cannot open", async () => {
    everyonePermissions = Permissions.VIEW_CHANNEL;
    ownerId = "somebody-else";

    await open();

    expect(
      within(nav()).queryByRole("button", { name: "Invites" }),
    ).not.toBeInTheDocument();
    expect(
      within(nav()).queryByRole("button", { name: "Audit log" }),
    ).not.toBeInTheDocument();

    expect(within(nav()).getByRole("button", { name: "Bans" })).toBeVisible();
    expect(within(nav()).getByRole("button", { name: "Roles" })).toBeVisible();
  });

  it("asks for every visible page's data as soon as it opens", async () => {
    await open();

    const asked = vi.mocked(fetch).mock.calls.map(([url]) => url as string);

    expect(asked.some((url) => url.includes("/roles"))).toBe(true);
    expect(asked.some((url) => url.includes("/members"))).toBe(true);
    expect(asked.some((url) => url.includes("/invites"))).toBe(true);
    expect(asked.some((url) => url.includes("/bans"))).toBe(true);
    expect(asked.some((url) => url.includes("/audit-log"))).toBe(true);
  });

  it("does not ask for a page this member cannot open", async () => {
    everyonePermissions = Permissions.VIEW_CHANNEL;
    ownerId = "u-grace";

    await open();

    const asked = vi.mocked(fetch).mock.calls.map(([url]) => url as string);

    expect(asked.some((url) => url.includes("/audit-log"))).toBe(false);
    expect(asked.some((url) => url.includes("/invites"))).toBe(false);
    expect(asked.some((url) => url.includes("/bans"))).toBe(true);
  });

  it("keeps a page's search while another page is visited", async () => {
    const user = await open();

    await user.click(within(nav()).getByRole("button", { name: "Members" }));

    const search = await screen.findByRole("combobox", {
      name: "Search members by @username or name",
    });

    await user.type(search, "grace");

    await user.click(within(nav()).getByRole("button", { name: "Bans" }));
    await screen.findByText("This server has no banned users");

    await user.click(within(nav()).getByRole("button", { name: "Members" }));

    expect(
      await screen.findByRole("combobox", {
        name: "Search members by @username or name",
      }),
    ).toHaveValue("grace");
  });

  it("forgets the search once the dialog is closed", async () => {
    const user = await open();

    await user.click(within(nav()).getByRole("button", { name: "Members" }));

    await user.type(
      await screen.findByRole("combobox", {
        name: "Search members by @username or name",
      }),
      "grace",
    );

    await user.keyboard("{Escape}{Escape}");
    await user.click(screen.getByRole("button", { name: "Server settings" }));

    expect(
      await screen.findByRole("heading", { name: "Overview" }),
    ).toBeVisible();
  });
});
