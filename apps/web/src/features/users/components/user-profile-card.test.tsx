import { Permissions } from "@opencord/shared/permissions";
import type { PublicUser } from "@opencord/shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { currentUserQuery } from "@/features/users/api/queries";
import { usePresence } from "@/stores/presence";
import { useUi } from "@/stores/ui";

import { UserProfileCard } from "./user-profile-card";
import { UserProfilePopover } from "./user-profile-popover";

const ADA: PublicUser = {
  id: "u-ada",
  username: "adalovelace",
  name: "Ada",
  avatarUrl: null,
  description: "Computer Science @ Waterloo\n\nBuilding analytical engines.",
  customStatus: "working on auth",
  customStatusEmoji: "🔒",
  isGuest: false,
};

const SERVER_ID = "22222222-2222-4222-8222-222222222222";

const EVERYONE = {
  id: "r-everyone",
  name: "@everyone",
  color: null,
  position: 0,
  permissions: 3,
  isDefault: true,
};

const MOD = {
  id: "r-mod",
  name: "Moderator",
  color: 0x3366ff,
  position: 5,
  permissions: 7 | Permissions.KICK_MEMBERS,
  isDefault: false,
};

const DESIGN = {
  id: "r-design",
  name: "Design",
  color: null,
  position: 3,
  permissions: 1,
  isDefault: false,
};

const ME: PublicUser = {
  id: "u-me",
  username: "me",
  name: "Me Myself",
  avatarUrl: null,
  description: null,
  customStatus: null,
  customStatusEmoji: null,
  isGuest: false,
};

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const me = url.endsWith("/users/@me");

    return Promise.resolve(
      new Response(JSON.stringify(me ? ME : status === 200 ? [body] : body), {
        status: me ? 200 : status,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function renderCard(userId = ADA.id) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  client.setQueryData(currentUserQuery.queryKey, ME);

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app"]}>
        <UserProfileCard userId={userId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderInServer({
  roleIds = [MOD.id, DESIGN.id],
  myRoles = [] as { id: string }[],
  userId = ADA.id,
} = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();

      const body = url.endsWith("/users/@me")
        ? ME
        : url.endsWith("/roles")
          ? [EVERYONE, MOD, DESIGN]
          : url.includes("/members/")
            ? {
                user: userId === ME.id ? ME : ADA,
                nickname: null,
                joinedAt: "2026-09-01T00:00:00.000Z",
                roleIds,
              }
            : url.includes("/servers/")
              ? {
                  id: SERVER_ID,
                  name: "Analytical Engine",
                  iconKey: null,
                  ownerId: "u-owner",
                  createdAt: "2026-09-01T00:00:00.000Z",
                  everyoneRole: EVERYONE,
                  roles: myRoles,
                }
              : [userId === ME.id ? ME : ADA];

      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  client.setQueryData(currentUserQuery.queryKey, ME);

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app"]}>
        <UserProfileCard serverId={SERVER_ID} userId={userId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
  usePresence.getState().reset();
  usePresence.getState().setSelf("online");
  useUi.getState().closeModal();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UserProfileCard", () => {
  it("loads the profile from the API rather than from its caller", async () => {
    const fetchMock = stubFetch(ADA);

    renderCard();

    expect(await screen.findByText("Ada")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/users?ids=u-ada",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("shows the display name, the handle, the status and the about text", async () => {
    stubFetch(ADA);

    renderCard();

    expect(await screen.findByText("Ada")).toBeVisible();
    expect(screen.getByText("@adalovelace")).toBeVisible();
    expect(screen.getByText("working on auth")).toBeVisible();
    expect(screen.getByText("🔒")).toBeVisible();
    expect(screen.getByText(/Computer Science @ Waterloo/)).toBeVisible();
  });

  it("keeps the lines of a multiline description", async () => {
    stubFetch(ADA);

    renderCard();

    const about = await screen.findByText(/Computer Science @ Waterloo/);

    expect(about).toHaveClass("whitespace-pre-line");
    expect(about).toHaveTextContent(
      /Computer Science @ Waterloo\s+Building analytical engines\./,
    );
  });

  it("names the presence the store reports", async () => {
    stubFetch(ADA);
    usePresence.getState().setStatus(ADA.id, "dnd");

    renderCard();

    expect(await screen.findAllByText("Do not disturb")).not.toHaveLength(0);
  });

  it("omits the about section and the status when there are none", async () => {
    stubFetch(ME);

    renderCard(ME.id);

    expect(await screen.findByText("Me Myself")).toBeVisible();
    expect(screen.queryByText("About")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Your status: Online/ }),
    ).toBeVisible();
  });

  it("offers editing on your own profile only", async () => {
    stubFetch(ME);

    renderCard(ME.id);

    expect(
      await screen.findByRole("button", { name: "Edit profile" }),
    ).toBeVisible();
  });

  it("offers no editing on somebody else's", async () => {
    stubFetch(ADA);

    renderCard();

    expect(await screen.findByText("Ada")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Edit profile" }),
    ).not.toBeInTheDocument();
  });

  it("offers a way to message somebody else, and not yourself", async () => {
    stubFetch(ADA);

    renderCard();

    expect(
      await screen.findByRole("button", { name: "Message" }),
    ).toBeVisible();
  });

  it("offers no way to message yourself", async () => {
    stubFetch(ME);

    renderCard(ME.id);

    expect(await screen.findByText("Me Myself")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Message" }),
    ).not.toBeInTheDocument();
  });

  it("shows no roles section outside a server", async () => {
    stubFetch(ADA);

    renderCard();

    expect(await screen.findByText("Ada")).toBeVisible();
    expect(screen.queryByText("Roles")).not.toBeInTheDocument();
    expect(screen.queryByText("Role")).not.toBeInTheDocument();
  });

  it("opens the profile dialog from the edit action", async () => {
    stubFetch(ME);

    renderCard(ME.id);

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit profile" }),
    );

    expect(useUi.getState().activeModal).toBe("profile");
  });

  it("lists the roles held in the server it was opened from, highest first", async () => {
    renderInServer();

    expect(await screen.findByText("Roles")).toBeVisible();

    const chips = screen.getAllByRole("listitem").map((li) => li.textContent);

    expect(chips).toEqual(["Moderator", "Design"]);
  });

  it("never lists @everyone, and shows no section for somebody who holds only it", async () => {
    renderInServer({ roleIds: [EVERYONE.id] });

    expect(await screen.findByText("Ada")).toBeVisible();
    expect(screen.queryByText("Roles")).not.toBeInTheDocument();
    expect(screen.queryByText("@everyone")).not.toBeInTheDocument();
  });

  it("offers Manage beside Message to somebody who outranks the member", async () => {
    renderInServer({ roleIds: [DESIGN.id], myRoles: [MOD] });

    expect(
      await screen.findByRole("button", { name: "Manage Ada" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Message" })).toBeVisible();
  });

  it("offers no Manage on a peer", async () => {
    renderInServer({ roleIds: [MOD.id], myRoles: [MOD] });

    expect(await screen.findByText("Ada")).toBeVisible();
    expect(screen.getByRole("button", { name: "Message" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /^Manage/ }),
    ).not.toBeInTheDocument();
  });

  it("offers no Manage at all without the permission", async () => {
    renderInServer({ roleIds: [DESIGN.id], myRoles: [] });

    expect(await screen.findByText("Ada")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /^Manage/ }),
    ).not.toBeInTheDocument();
  });

  it("reports a failure rather than an empty card", async () => {
    stubFetch({ error: { code: "NOT_FOUND", message: "no" } }, 404);

    renderCard();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load that profile.",
    );
  });
});

describe("UserProfilePopover", () => {
  function renderPopover() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    client.setQueryData(currentUserQuery.queryKey, ME);

    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app"]}>
          <UserProfilePopover label="Ada's profile" userId={ADA.id}>
            Ada
          </UserProfilePopover>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("opens the shared card from its trigger and closes on Escape", async () => {
    stubFetch(ADA);

    renderPopover();

    const trigger = screen.getByRole("button", { name: "Ada's profile" });

    await userEvent.click(trigger);

    expect(await screen.findByText("@adalovelace")).toBeVisible();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByText("@adalovelace")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("opens from the keyboard", async () => {
    stubFetch(ADA);

    renderPopover();

    await userEvent.tab();

    expect(screen.getByRole("button", { name: "Ada's profile" })).toHaveFocus();

    await userEvent.keyboard("{Enter}");

    expect(await screen.findByText("@adalovelace")).toBeVisible();
  });
});
