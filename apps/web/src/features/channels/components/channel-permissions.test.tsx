import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stateOf, withState } from "@/features/channels/lib/overwrites";
import { CHANNEL_PERMISSION_NAMES } from "@/features/roles/lib/permissions";

import { ChannelPermissions } from "./channel-permissions";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const CHANNEL_ID = "88888888-8888-4888-8888-888888888888";
const EVERYONE_ID = "22222222-2222-4222-8222-222222222222";
const MODERATOR_ID = "33333333-3333-4333-8333-333333333333";
const ME = "u-ada";

let overwrites: {
  roles: { roleId: string; allow: number; deny: number }[];
  members: { userId: string; allow: number; deny: number }[];
};

let everyonePermissions: number;
let actorPermissions: number;

let requests: { url: string; method: string; body: unknown }[];

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      requests.push({
        url,
        method: init?.method ?? "GET",
        body:
          init?.body === undefined
            ? null
            : (JSON.parse(init.body) as Record<string, unknown>),
      });

      if (url.endsWith("/overwrites")) {
        return Promise.resolve(new Response(JSON.stringify(overwrites)));
      }

      if (url.endsWith("/roles")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: EVERYONE_ID,
                name: "@everyone",
                color: null,
                position: 0,
                permissions: everyonePermissions,
                isDefault: true,
              },
              {
                id: MODERATOR_ID,
                name: "Moderator",
                color: null,
                position: 1,
                permissions: Permissions.MANAGE_MESSAGES,
                isDefault: false,
              },
            ]),
          ),
        );
      }

      if (url.includes("/members")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  user: { id: "u-grace", username: "grace", name: "Grace" },
                  roleIds: [],
                },
              ],
              nextCursor: null,
            }),
          ),
        );
      }

      if (url.endsWith("/users/@me")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: ME, username: "ada", name: "Ada" }),
          ),
        );
      }

      if (url.endsWith(`/servers/${SERVER_ID}`)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: SERVER_ID,
              name: "Analytical Engine",
              iconKey: null,
              ownerId: "u-somebody-else",
              createdAt: "2026-09-11T10:00:00.000Z",
              everyoneRole: {
                id: EVERYONE_ID,
                name: "@everyone",
                color: null,
                position: 0,
                permissions: actorPermissions,
                isDefault: true,
              },
              viewerRoles: [],
            }),
          ),
        );
      }

      return Promise.resolve(new Response("{}"));
    }),
  );
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <ChannelPermissions
        channelId={CHANNEL_ID}
        channelName="general"
        serverId={SERVER_ID}
      />
    </QueryClientProvider>,
  );
}

async function ready() {
  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: "Role" })).toHaveTextContent(
      "@everyone",
    );
  });
}

beforeEach(() => {
  requests = [];
  overwrites = { roles: [], members: [] };
  everyonePermissions = Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES;
  actorPermissions = Permissions.VIEW_CHANNEL | Permissions.MANAGE_ROLES;
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ChannelPermissions", () => {
  it("names the channel it is configuring rather than asking for one", async () => {
    renderPanel();

    expect(await screen.findByText("#general")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: "Channel" }),
    ).not.toBeInTheDocument();
  });

  it("offers three states per bit, not a checkbox", async () => {
    renderPanel();

    expect(
      await screen.findByRole("radiogroup", { name: "View channel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "View channel: Inherit" }),
    ).toBeChecked();
  });

  it("offers only the bits a channel override can change", async () => {
    renderPanel();

    await screen.findByRole("radiogroup", { name: "View channel" });

    expect(screen.getAllByRole("radiogroup")).toHaveLength(
      CHANNEL_PERMISSION_NAMES.length,
    );

    for (const absent of [
      "Create invites",
      "Ban members",
      "Kick members",
      "Manage server",
      "Administrator",
    ]) {
      expect(
        screen.queryByRole("radiogroup", { name: absent }),
      ).not.toBeInTheDocument();
    }
  });

  it("names each bit for the channel rather than for the server", async () => {
    renderPanel();

    expect(
      await screen.findByRole("radiogroup", { name: "View channel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "Manage permissions" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("radiogroup", { name: "View channels" }),
    ).not.toBeInTheDocument();
  });

  it("says what an inherited row falls back to", async () => {
    renderPanel();

    await ready();

    expect(screen.getAllByText("Allowed by default")).toHaveLength(2);
    expect(screen.getAllByText("Not allowed by default").length).toBe(
      CHANNEL_PERMISSION_NAMES.length - 2,
    );
  });

  it("reflects a stored deny", async () => {
    overwrites = {
      roles: [
        { roleId: EVERYONE_ID, allow: 0, deny: Permissions.VIEW_CHANNEL },
      ],
      members: [],
    };

    renderPanel();

    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: "View channel: Deny" }),
      ).toBeChecked();
    });
  });

  it("counts the overrides for the selected role and for the others", async () => {
    const user = userEvent.setup();

    overwrites = {
      roles: [
        { roleId: EVERYONE_ID, allow: 0, deny: Permissions.VIEW_CHANNEL },
        {
          roleId: MODERATOR_ID,
          allow: Permissions.SEND_MESSAGES,
          deny: Permissions.ADD_REACTIONS,
        },
      ],
      members: [],
    };

    renderPanel();

    await ready();

    expect(
      screen.getByText(
        `1 of ${String(CHANNEL_PERMISSION_NAMES.length)} overridden`,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("combobox", { name: "Role" }));

    expect(
      await screen.findByRole("option", { name: /Moderator/ }),
    ).toHaveTextContent("2 overrides");
  });

  it("offers roles alone, and no members", async () => {
    const user = userEvent.setup();

    renderPanel();

    await ready();

    await user.click(screen.getByRole("combobox", { name: "Role" }));

    expect(
      await screen.findByRole("option", { name: /@everyone/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /Moderator/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Grace/ }),
    ).not.toBeInTheDocument();
  });

  it("says so when a target is inheriting everything", async () => {
    renderPanel();

    await ready();

    expect(
      screen.getByText(
        `Inheriting all ${String(CHANNEL_PERMISSION_NAMES.length)}`,
      ),
    ).toBeInTheDocument();
  });

  it("names the rows that actually differ from the default", async () => {
    overwrites = {
      roles: [
        {
          roleId: EVERYONE_ID,
          allow: Permissions.SEND_MESSAGES,
          deny: Permissions.VIEW_CHANNEL,
        },
      ],
      members: [],
    };

    renderPanel();

    await ready();

    expect(screen.getByText("Removed for this channel")).toBeInTheDocument();
    expect(
      screen.queryByText("Added for this channel"),
    ).not.toBeInTheDocument();
  });

  it("starts on @everyone and saves its override", async () => {
    const user = userEvent.setup();

    renderPanel();

    await ready();

    await user.click(screen.getByRole("radio", { name: "View channel: Deny" }));
    await user.click(screen.getByRole("button", { name: "Save overrides" }));

    const put = requests.find((entry) => entry.method === "PUT");

    expect(put?.url).toBe(
      `/api/v1/channels/${CHANNEL_ID}/overwrites/roles/${EVERYONE_ID}`,
    );
    expect(put?.body).toEqual({ allow: 0, deny: Permissions.VIEW_CHANNEL });
  });

  it("resets the rows without writing anything", async () => {
    const user = userEvent.setup();

    overwrites = {
      roles: [
        { roleId: EVERYONE_ID, allow: 0, deny: Permissions.VIEW_CHANNEL },
      ],
      members: [],
    };

    renderPanel();

    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: "View channel: Deny" }),
      ).toBeChecked();
    });

    await user.click(screen.getByRole("button", { name: "Reset to default" }));

    expect(
      screen.getByRole("radio", { name: "View channel: Inherit" }),
    ).toBeChecked();
    expect(requests.some((entry) => entry.method === "DELETE")).toBe(false);
    expect(requests.some((entry) => entry.method === "PUT")).toBe(false);
  });

  it("persists a reset only once Save is pressed", async () => {
    const user = userEvent.setup();

    overwrites = {
      roles: [
        { roleId: EVERYONE_ID, allow: 0, deny: Permissions.VIEW_CHANNEL },
      ],
      members: [],
    };

    renderPanel();

    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: "View channel: Deny" }),
      ).toBeChecked();
    });

    await user.click(screen.getByRole("button", { name: "Reset to default" }));
    await user.click(screen.getByRole("button", { name: "Save overrides" }));

    await waitFor(() => {
      expect(requests.find((entry) => entry.method === "DELETE")?.url).toBe(
        `/api/v1/channels/${CHANNEL_ID}/overwrites/roles/${EVERYONE_ID}`,
      );
    });
  });

  it("does not offer to reset a target that has no override", async () => {
    renderPanel();

    await screen.findByRole("radiogroup", { name: "View channel" });

    expect(
      screen.queryByRole("button", { name: "Reset to default" }),
    ).not.toBeInTheDocument();
  });

  describe("without Manage roles", () => {
    beforeEach(() => {
      actorPermissions = Permissions.VIEW_CHANNEL;
    });

    it("keeps the target selector usable", async () => {
      const user = userEvent.setup();

      renderPanel();

      await ready();

      const selector = screen.getByRole("combobox", { name: "Role" });

      expect(selector).toBeEnabled();

      await user.click(selector);

      expect(
        await screen.findByRole("option", { name: "Moderator" }),
      ).toBeInTheDocument();
    });

    it("shows the values and refuses every change", async () => {
      const user = userEvent.setup();

      renderPanel();

      await screen.findByRole("radiogroup", { name: "View channel" });

      const deny = screen.getByRole("radio", { name: "View channel: Deny" });

      expect(deny).toBeDisabled();
      expect(
        screen.getByRole("radiogroup", { name: "View channel" }),
      ).toHaveAttribute("aria-readonly", "true");

      await user.click(deny);

      expect(requests.some((entry) => entry.method === "PUT")).toBe(false);
    });

    it("offers neither Save nor Reset", async () => {
      overwrites = {
        roles: [
          { roleId: EVERYONE_ID, allow: 0, deny: Permissions.VIEW_CHANNEL },
        ],
        members: [],
      };

      renderPanel();

      await screen.findByRole("radiogroup", { name: "View channel" });

      expect(
        screen.queryByRole("button", { name: "Save overrides" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Reset to default" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/changing it needs Manage roles/i),
      ).toBeInTheDocument();
    });
  });
});

describe("the three-state masks", () => {
  it("reads allow, deny and inherit apart", () => {
    expect(stateOf(Permissions.VIEW_CHANNEL, 0, Permissions.VIEW_CHANNEL)).toBe(
      "allow",
    );
    expect(stateOf(0, Permissions.VIEW_CHANNEL, Permissions.VIEW_CHANNEL)).toBe(
      "deny",
    );
    expect(stateOf(0, 0, Permissions.VIEW_CHANNEL)).toBe("neutral");
  });

  it("never leaves a bit in both masks", () => {
    const denied = withState(
      { allow: Permissions.VIEW_CHANNEL, deny: 0 },
      Permissions.VIEW_CHANNEL,
      "deny",
    );

    expect(denied).toEqual({ allow: 0, deny: Permissions.VIEW_CHANNEL });

    const allowed = withState(denied, Permissions.VIEW_CHANNEL, "allow");

    expect(allowed).toEqual({ allow: Permissions.VIEW_CHANNEL, deny: 0 });
  });

  it("makes inherit representable", () => {
    expect(
      withState(
        { allow: 0, deny: Permissions.VIEW_CHANNEL },
        Permissions.VIEW_CHANNEL,
        "neutral",
      ),
    ).toEqual({ allow: 0, deny: 0 });
  });
});
