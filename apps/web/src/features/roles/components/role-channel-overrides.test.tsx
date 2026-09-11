import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerRoleSummary } from "@/features/roles/api/queries";
import { RoleChannelOverrides } from "@/features/roles/components/role-channel-overrides";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const ROLE_ID = "22222222-2222-4222-8222-222222222222";
const CHANNEL_ID = "33333333-3333-4333-8333-333333333333";

const ROLE: ServerRoleSummary = {
  id: ROLE_ID,
  name: "Moderators",
  color: null,
  position: 1,
  permissions: Permissions.VIEW_CHANNEL,
  isDefault: false,
  memberCount: 2,
};

let requests: { url: string; method: string; body: unknown }[];
let stored: { roleId: string; allow: number; deny: number }[];

function renderOverrides({ readOnly = false }: { readOnly?: boolean } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <RoleChannelOverrides
        everyonePermissions={Permissions.VIEW_CHANNEL}
        readOnly={readOnly}
        role={ROLE}
        serverId={SERVER_ID}
      />
    </QueryClientProvider>,
  );
}

async function expand() {
  const user = userEvent.setup();

  renderOverrides();

  await user.click(await screen.findByRole("button", { name: /general/ }));
  await screen.findByRole("radiogroup", { name: "Send messages" });

  return user;
}

beforeEach(() => {
  requests = [];
  stored = [];

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? "GET";

      requests.push({
        url,
        method,
        body: init?.body === undefined ? null : JSON.parse(init.body),
      });

      if (method === "DELETE") {
        stored = [];

        return Promise.resolve(new Response(null, { status: 204 }));
      }

      if (method === "PUT") {
        const masks = JSON.parse(init?.body ?? "{}") as {
          allow: number;
          deny: number;
        };

        stored = [{ roleId: ROLE_ID, ...masks }];

        return Promise.resolve(new Response(null, { status: 204 }));
      }

      if (url.endsWith("/overwrites")) {
        return Promise.resolve(
          new Response(JSON.stringify({ roles: stored, members: [] })),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify([{ id: CHANNEL_ID, name: "general", type: "text" }]),
        ),
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RoleChannelOverrides", () => {
  it("stays in the channel after saving", async () => {
    const user = await expand();

    await user.click(
      screen.getByRole("radio", { name: "Send messages: Deny" }),
    );
    await user.click(screen.getByRole("button", { name: "Save override" }));

    await waitFor(() => {
      expect(requests.some((entry) => entry.method === "PUT")).toBe(true);
    });

    expect(
      screen.getByRole("radiogroup", { name: "Send messages" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Send messages: Deny" }),
    ).toBeChecked();
  });

  it("resets the rows without writing anything", async () => {
    stored = [{ roleId: ROLE_ID, allow: 0, deny: Permissions.SEND_MESSAGES }];

    const user = await expand();

    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: "Send messages: Deny" }),
      ).toBeChecked();
    });

    await user.click(
      screen.getByRole("button", { name: "Reset to role defaults" }),
    );

    expect(
      screen.getByRole("radio", { name: "Send messages: Inherit" }),
    ).toBeChecked();
    expect(requests.some((entry) => entry.method !== "GET")).toBe(false);
  });

  it("persists a reset only once Save is pressed", async () => {
    stored = [{ roleId: ROLE_ID, allow: 0, deny: Permissions.SEND_MESSAGES }];

    const user = await expand();

    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: "Send messages: Deny" }),
      ).toBeChecked();
    });

    await user.click(
      screen.getByRole("button", { name: "Reset to role defaults" }),
    );
    await user.click(screen.getByRole("button", { name: "Save override" }));

    await waitFor(() => {
      expect(requests.find((entry) => entry.method === "DELETE")?.url).toBe(
        `/api/v1/channels/${CHANNEL_ID}/overwrites/roles/${ROLE_ID}`,
      );
    });
  });

  it("offers neither Save nor Reset to somebody who may not write", async () => {
    const user = userEvent.setup();

    stored = [{ roleId: ROLE_ID, allow: 0, deny: Permissions.SEND_MESSAGES }];

    renderOverrides({ readOnly: true });

    await user.click(await screen.findByRole("button", { name: /general/ }));
    await screen.findByRole("radiogroup", { name: "Send messages" });

    expect(
      screen.queryByRole("button", { name: "Save override" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reset to role defaults" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Send messages: Deny" }),
    ).toBeDisabled();
  });
});
