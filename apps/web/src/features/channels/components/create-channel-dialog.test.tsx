import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUi } from "@/stores/ui";

import { CreateChannelDialog } from "./create-channel-dialog";

const SERVER_ID = "33333333-3333-4333-8333-333333333333";

const EVERYONE = {
  id: "r-everyone",
  name: "@everyone",
  color: null,
  position: 0,
  permissions: Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES,
  isDefault: true,
};

const MANAGER = {
  id: "r-manager",
  name: "Manager",
  color: null,
  position: 4,
  permissions: Permissions.MANAGE_CHANNELS,
  isDefault: false,
};

const ME = { id: "u-me", username: "me", name: "Me", avatarUrl: null };

function stubApi(roles: (typeof MANAGER)[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString();

      const body = url.endsWith("/users/@me")
        ? ME
        : {
            id: SERVER_ID,
            name: "Analytical Engine",
            iconKey: null,
            ownerId: "u-owner",
            createdAt: "2026-09-01T00:00:00.000Z",
            everyoneRole: EVERYONE,
            viewerRoles: roles,
          };

      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
}

function mountDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <CreateChannelDialog serverId={SERVER_ID} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useUi.setState({ activeModal: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CreateChannelDialog", () => {
  it("shows the affordance to a member who holds MANAGE_CHANNELS", async () => {
    stubApi([MANAGER]);

    mountDialog();

    expect(
      await screen.findByRole("button", { name: "Create a channel" }),
    ).toBeInTheDocument();
  });

  it("hides the affordance from a member who does not", async () => {
    stubApi([]);

    mountDialog();

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Create a channel" }),
      ).not.toBeInTheDocument();
    });
  });
});
