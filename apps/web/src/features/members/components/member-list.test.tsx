import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ServerMemberEntry } from "@/features/members/api/queries";
import type { PublicRole } from "@/features/roles/api/queries";

import { MemberList } from "./member-list";

const SERVER_ID = "22222222-2222-4222-8222-222222222222";

const ROLES: PublicRole[] = [
  {
    id: "r-everyone",
    name: "@everyone",
    color: null,
    position: 0,
    permissions: 3,
    isDefault: true,
  },
  {
    id: "r-mod",
    name: "Moderator",
    color: 0x3366ff,
    position: 5,
    permissions: 7 | Permissions.KICK_MEMBERS,
    isDefault: false,
  },
  {
    id: "r-bot",
    name: "Bot",
    color: null,
    position: 9,
    permissions: 1,
    isDefault: false,
  },
];

function member(
  id: string,
  name: string,
  roleIds: string[],
  nickname: string | null = null,
): ServerMemberEntry {
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
    nickname,
    joinedAt: "2026-09-01T00:00:00.000Z",
    roleIds,
  };
}

const MEMBERS = [
  member("u-ada", "Ada", ["r-mod"]),
  member("u-grace", "Grace", []),
  member("u-hal", "Hal", ["r-bot"], "HAL 9000"),
];

const SERVER_DETAIL = {
  id: SERVER_ID,
  name: "Analytical Engine",
  iconKey: null,
  ownerId: "u-owner",
  createdAt: "2026-09-01T00:00:00.000Z",
  everyoneRole: ROLES[0],
  viewerRoles: [],
};

const ME = {
  id: "u-me",
  username: "me",
  name: "Me",
  avatarUrl: null,
  description: null,
  customStatus: null,
  customStatusEmoji: null,
  isGuest: false,
};

function stubApi(
  members: ServerMemberEntry[],
  roles: PublicRole[],
  ownerId: string = SERVER_DETAIL.ownerId,
) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body = url.endsWith("/users/@me")
      ? ME
      : url.endsWith("/roles")
        ? roles
        : url.includes("/members")
          ? { data: members, nextCursor: null }
          : { ...SERVER_DETAIL, ownerId };

    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function mountList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <MemberList serverId={SERVER_ID} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MemberList", () => {
  it("crowns the server owner and nobody else", async () => {
    stubApi(MEMBERS, ROLES, "u-grace");

    mountList();

    expect(
      await screen.findByRole("button", {
        name: "Grace's profile, server owner",
      }),
    ).toBeInTheDocument();

    expect(screen.getAllByLabelText("Server owner")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "HAL 9000's profile" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ada's profile" }),
    ).toBeInTheDocument();
  });

  it("holds the crown's column open on every row", async () => {
    stubApi(MEMBERS, ROLES, "u-grace");

    mountList();

    await screen.findByLabelText("Server owner");

    const slots = screen.getAllByTestId("member-badge");

    expect(slots).toHaveLength(MEMBERS.length);

    for (const slot of slots) {
      expect(slot).toHaveClass("w-4", "shrink-0");
    }

    expect(
      slots.filter((slot) => within(slot).queryByLabelText("Server owner")),
    ).toHaveLength(1);
  });

  it("crowns nobody when the owner is not on screen", async () => {
    stubApi(MEMBERS, ROLES);

    mountList();

    await screen.findByText("Ada");

    expect(screen.queryByLabelText("Server owner")).not.toBeInTheDocument();
  });

  it("groups members under their highest-positioned role", async () => {
    stubApi(MEMBERS, ROLES);

    mountList();

    const bot = await screen.findByRole("region", { name: /^Bot/ });
    const moderator = screen.getByRole("region", { name: /^Moderator/ });
    const everyone = screen.getByRole("region", { name: /^@everyone/ });

    expect(within(bot).getByText("HAL 9000")).toBeInTheDocument();
    expect(within(moderator).getByText("Ada")).toBeInTheDocument();
    expect(within(everyone).getByText("Grace")).toBeInTheDocument();
  });

  it("orders the groups from the highest role down", async () => {
    stubApi(MEMBERS, ROLES);

    mountList();

    await screen.findByRole("region", { name: /^Bot/ });

    expect(
      screen.getAllByRole("region").map((region) => region.textContent),
    ).toEqual([
      expect.stringContaining("Bot"),
      expect.stringContaining("Moderator"),
      expect.stringContaining("@everyone"),
    ]);
  });

  it("counts the members in each group heading", async () => {
    stubApi([...MEMBERS, member("u-alan", "Alan", ["r-mod"])], ROLES);

    mountList();

    expect(
      await screen.findByRole("heading", { name: "Moderator 2" }),
    ).toBeInTheDocument();
  });

  it("prefers the nickname over the account name", async () => {
    stubApi(MEMBERS, ROLES);

    mountList();

    expect(await screen.findByText("HAL 9000")).toBeInTheDocument();
    expect(screen.queryByText("Hal")).not.toBeInTheDocument();
  });

  it("paints the name with the highest coloured role and leaves the rest inheriting", async () => {
    stubApi(MEMBERS, ROLES);

    mountList();

    const moderator = await screen.findByRole("region", { name: /^Moderator/ });
    const everyone = screen.getByRole("region", { name: /^@everyone/ });

    expect(within(moderator).getByRole("listitem")).toHaveStyle({
      "--member-color": "#3366ff",
    });
    expect(within(everyone).getByRole("listitem")).not.toHaveAttribute("style");
  });

  it("carries no per-row actions", async () => {
    stubApi(MEMBERS, ROLES);

    mountList();

    await screen.findByRole("region", { name: /^Bot/ });

    expect(
      screen.queryAllByRole("button", { name: /^Member actions/ }),
    ).toEqual([]);
    expect(screen.queryAllByRole("button", { name: /^Message / })).toEqual([]);
  });

  it("shows a status line rather than the handle", async () => {
    stubApi(
      [
        member("u-ada", "Ada", ["r-mod"]),
        {
          ...member("u-grace", "Grace", []),
          user: {
            ...member("u-grace", "Grace", []).user,
            customStatus: "reviewing PRs",
            customStatusEmoji: null,
            isGuest: false,
          },
        },
      ],
      ROLES,
    );

    mountList();

    expect(await screen.findByText("Ada")).toBeInTheDocument();
    expect(screen.getByText("reviewing PRs")).toBeInTheDocument();
    expect(screen.queryByText("@ada")).not.toBeInTheDocument();
    expect(screen.queryByText("@grace")).not.toBeInTheDocument();
    expect(screen.queryByText("Offline")).not.toBeInTheDocument();
  });

  it("an uncoloured highest role falls back to a coloured lower one", async () => {
    stubApi([member("u-hal", "Hal", ["r-bot", "r-mod"])], ROLES);

    mountList();

    const bot = await screen.findByRole("region", { name: /^Bot/ });

    expect(within(bot).getByRole("listitem")).toHaveStyle({
      "--member-color": "#3366ff",
    });
  });
});
