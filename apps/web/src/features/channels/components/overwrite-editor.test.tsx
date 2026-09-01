import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stateOf, withState } from "@/features/channels/lib/overwrites";

import { OverwriteEditor } from "./overwrite-editor";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";
const CHANNEL_ID = "88888888-8888-4888-8888-888888888888";
const EVERYONE_ID = "22222222-2222-4222-8222-222222222222";

let overwrites: {
  roles: { roleId: string; allow: number; deny: number }[];
  members: { userId: string; allow: number; deny: number }[];
};

let requests: { url: string; method: string; body: unknown }[];

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      requests.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body === undefined ? null : JSON.parse(init.body),
      });

      if (url.endsWith("/overwrites")) {
        return Promise.resolve(new Response(JSON.stringify(overwrites)));
      }

      if (url.endsWith("/channels")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: CHANNEL_ID,
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
              },
            ]),
          ),
        );
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
                permissions: Permissions.VIEW_CHANNEL,
                isDefault: true,
              },
            ]),
          ),
        );
      }

      if (url.includes("/members")) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [], nextCursor: null })),
        );
      }

      return Promise.resolve(new Response("{}"));
    }),
  );
}

function renderEditor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <OverwriteEditor serverId={SERVER_ID} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  requests = [];
  overwrites = { roles: [], members: [] };
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OverwriteEditor", () => {
  it("offers three states per bit, not a checkbox", async () => {
    renderEditor();

    const group = await screen.findByRole("radiogroup", {
      name: "View channels",
    });

    expect(group).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "View channels: Inherit" }),
    ).toBeChecked();
  });

  it("reflects a stored deny", async () => {
    overwrites = {
      roles: [
        { roleId: EVERYONE_ID, allow: 0, deny: Permissions.VIEW_CHANNEL },
      ],
      members: [],
    };

    renderEditor();

    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: "View channels: Deny" }),
      ).toBeChecked();
    });
  });

  it("sends the deny mask the editor shows", async () => {
    const user = userEvent.setup();

    renderEditor();

    await screen.findByRole("radiogroup", { name: "View channels" });

    await user.click(
      screen.getByRole("radio", { name: "View channels: Deny" }),
    );
    await user.click(screen.getByRole("button", { name: "Save overwrite" }));

    const put = requests.find((entry) => entry.method === "PUT");

    expect(put?.url).toBe(
      `/api/v1/channels/${CHANNEL_ID}/overwrites/roles/${EVERYONE_ID}`,
    );
    expect(put?.body).toEqual({ allow: 0, deny: Permissions.VIEW_CHANNEL });
  });

  it("clears the overwrite entirely", async () => {
    const user = userEvent.setup();

    renderEditor();

    await screen.findByRole("radiogroup", { name: "View channels" });

    await user.click(screen.getByRole("button", { name: "Clear overwrite" }));

    expect(requests.find((entry) => entry.method === "DELETE")?.url).toBe(
      `/api/v1/channels/${CHANNEL_ID}/overwrites/roles/${EVERYONE_ID}`,
    );
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
