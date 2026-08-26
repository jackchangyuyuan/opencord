import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
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
    user: { id, username: name.toLowerCase(), name, avatarUrl: null },
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
  roles: [],
};

const ME = { id: "u-me", username: "me", name: "Me", avatarUrl: null };

function stubApi(members: ServerMemberEntry[], roles: PublicRole[]) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body = url.endsWith("/users/@me")
      ? ME
      : url.endsWith("/roles")
        ? roles
        : url.includes("/members")
          ? { data: members, nextCursor: null }
          : SERVER_DETAIL;

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
      <MemberList serverId={SERVER_ID} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MemberList", () => {
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
      await screen.findByRole("heading", { name: "Moderator — 2" }),
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

  it("hides the action menu from a member who can moderate nobody", async () => {
    stubApi(MEMBERS, ROLES);

    mountList();

    await screen.findByRole("region", { name: /^Bot/ });

    expect(
      screen.queryAllByRole("button", { name: /^Member actions/ }),
    ).toEqual([]);
  });

  it("greys out actions on peers and on the owner", async () => {
    stubApi(
      [member("u-me", "Me", ["r-mod"]), member("u-owner", "Owner", [])],
      ROLES,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input) => {
        const url = input instanceof Request ? input.url : input.toString();

        const body = url.endsWith("/users/@me")
          ? ME
          : url.endsWith("/roles")
            ? ROLES
            : url.includes("/members")
              ? {
                  data: [
                    member("u-me", "Me", ["r-mod"]),
                    member("u-owner", "Owner", []),
                    member("u-peer", "Peer", ["r-mod"]),
                    member("u-junior", "Junior", []),
                  ],
                  nextCursor: null,
                }
              : { ...SERVER_DETAIL, roles: [ROLES[1]] };

        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    );

    mountList();

    expect(
      await screen.findByRole("button", { name: "Member actions for Junior" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Member actions for Peer" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Member actions for Owner" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Member actions for Me" }),
    ).toBeDisabled();
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
