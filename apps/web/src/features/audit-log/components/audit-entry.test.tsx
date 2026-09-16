import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuditLogEntry } from "@/features/audit-log/api/queries";
import { AuditLogPage } from "@/features/audit-log/components/audit-log-page";

import { AuditEntry } from "./audit-entry";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";

let permissions: number;
let auditStatus: number;
let entries: AuditLogEntry[];

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: "a-1",
    actorId: "u-ada",
    action: "member_ban",
    targetType: "user",
    targetId: "u-grace",
    metadata: null,
    createdAt: "2026-09-11T10:00:00.000Z",
    ...overrides,
  };
}

const NAMES: Record<string, string> = {
  "u-ada": "Ada",
  "u-grace": "Grace",
};

function person(id: string) {
  return {
    id,
    username: id,
    name: NAMES[id] ?? "Somebody",
    avatarUrl: null,
  };
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("/audit-log/people")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { id: "u-ada", username: "ada", name: "Ada", isActor: true },
              {
                id: "u-grace",
                username: "grace",
                name: "Grace",
                isActor: false,
              },
            ]),
          ),
        );
      }

      if (url.includes("/audit-log")) {
        return Promise.resolve(
          new Response(
            JSON.stringify(
              auditStatus === 200
                ? { data: entries, nextCursor: null }
                : { error: { code: "FORBIDDEN", message: "Forbidden" } },
            ),
            { status: auditStatus },
          ),
        );
      }

      if (url.endsWith("/users/@me")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "u-ada",
              username: "ada",
              name: "Ada",
              avatarUrl: null,
            }),
          ),
        );
      }

      if (url.includes("/users?ids=")) {
        const ids =
          new URL(url, "http://localhost").searchParams.get("ids") ?? "";

        return Promise.resolve(
          new Response(
            JSON.stringify(ids.split(",").filter(Boolean).map(person)),
          ),
        );
      }

      if (url.includes("/users/")) {
        const id = url.split("/users/")[1]?.split(/[?/]/)[0] ?? "u-ada";

        return Promise.resolve(new Response(JSON.stringify(person(id))));
      }

      if (url.endsWith(`/servers/${SERVER_ID}`)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: SERVER_ID,
              name: "Analytical Engine",
              description: null,
              iconKey: null,
              ownerId: "u-grace",
              createdAt: "2026-09-11T10:00:00.000Z",
              everyoneRole: {
                id: "r-everyone",
                name: "@everyone",
                color: null,
                permissions,
                position: 0,
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

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function requested(): string {
  const mock = globalThis.fetch as unknown as {
    mock: { calls: [string][] };
  };

  return mock.mock.calls.map(([url]) => url).join(" ");
}

beforeEach(() => {
  permissions = Permissions.VIEW_CHANNEL | Permissions.MANAGE_SERVER;
  auditStatus = 200;
  entries = [entry()];

  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderEntry(over: Partial<AuditLogEntry> = {}) {
  return render(
    <QueryClientProvider client={client()}>
      <ul>
        <AuditEntry channelName={null} entry={entry(over)} roleName={null} />
      </ul>
    </QueryClientProvider>,
  );
}

describe("AuditEntry", () => {
  it("names the person a ban happened to and the one who did it", async () => {
    renderEntry({ action: "member_ban" });

    await screen.findByText(/@u-grace/);

    expect(screen.getByRole("listitem")).toHaveTextContent(
      "@u-grace was banned by @u-ada",
    );
    expect(screen.queryByText("member_ban")).not.toBeInTheDocument();
  });

  it("shows the reason the moderator recorded", async () => {
    renderEntry({
      action: "member_ban",
      metadata: { reason: "Spam and repeated invite links" },
    });

    expect(
      await screen.findByText(/Spam and repeated invite links/),
    ).toBeInTheDocument();
  });

  it("puts no reason on screen when none was recorded", async () => {
    renderEntry({ action: "member_ban" });

    await screen.findByText(/@u-grace/);

    expect(screen.queryByText(/Reason:/)).not.toBeInTheDocument();
  });

  it("keeps the exact instant reachable behind the relative one", async () => {
    renderEntry({ action: "member_ban" });

    await screen.findByText(/@u-grace/);

    expect(screen.getByTitle(/2026|Sep/)).toHaveAttribute(
      "dateTime",
      "2026-09-11T10:00:00.000Z",
    );
  });

  it("puts no internal id on the screen", async () => {
    renderEntry({
      action: "role_assign",
      metadata: { roleId: "01a0a6a8-bebb-7488-9ce6-e6baa16c355f" },
      targetId: "u-grace",
      targetType: "member",
    });

    await screen.findByText(/@u-grace/);

    const row = screen.getByRole("listitem");

    expect(row).not.toHaveTextContent("01a0a6a8");
    expect(row).toHaveTextContent("a role that no longer exists");
  });
});

describe("AuditLogPage", () => {
  it("lists the record reverse-chronologically as the server ordered it", async () => {
    entries = [
      entry({ id: "a-2", action: "channel_create" }),
      entry({ id: "a-1", action: "member_ban" }),
    ];

    render(
      <QueryClientProvider client={client()}>
        <AuditLogPage serverId={SERVER_ID} />
      </QueryClientProvider>,
    );

    const rows = await screen.findAllByRole("listitem");

    expect(rows[0]).toHaveTextContent(
      "created a channel that no longer exists",
    );
    expect(rows[1]).toHaveTextContent("was banned by");
  });

  it("renders nothing for a member without MANAGE_SERVER", async () => {
    permissions = Permissions.VIEW_CHANNEL;

    const { container } = render(
      <QueryClientProvider client={client()}>
        <AuditLogPage serverId={SERVER_ID} />
      </QueryClientProvider>,
    );

    await Promise.resolve();

    expect(container).toBeEmptyDOMElement();
  });

  it("says so when the API refuses anyway", async () => {
    auditStatus = 403;

    render(
      <QueryClientProvider client={client()}>
        <AuditLogPage serverId={SERVER_ID} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load this server\u2019s audit log.",
    );
  });

  it("asks the API for the filter rather than narrowing what it has", async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={client()}>
        <AuditLogPage serverId={SERVER_ID} />
      </QueryClientProvider>,
    );

    await screen.findAllByRole("listitem");

    await user.click(screen.getByRole("button", { name: /^Action/ }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Member banned" }),
    );

    await waitFor(() => {
      expect(requested()).toContain("action=member_ban");
    });
  });

  it("shows an active filter as a removable chip", async () => {
    const user = userEvent.setup();

    render(
      <QueryClientProvider client={client()}>
        <AuditLogPage serverId={SERVER_ID} />
      </QueryClientProvider>,
    );

    await screen.findAllByRole("listitem");

    await user.click(screen.getByRole("button", { name: /^Action/ }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Member banned" }),
    );

    const chip = await screen.findByRole("button", {
      name: "Remove filter Member banned",
    });

    await user.click(chip);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Remove filter Member banned" }),
      ).not.toBeInTheDocument();
    });
  });

  it("tells an empty record apart from a filtered one with no matches", async () => {
    const user = userEvent.setup();

    entries = [];

    render(
      <QueryClientProvider client={client()}>
        <AuditLogPage serverId={SERVER_ID} />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("Nothing has happened yet"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Action/ }));
    await user.click(
      await screen.findByRole("menuitemcheckbox", { name: "Member banned" }),
    );

    expect(
      await screen.findByText("No entries match these filters"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Clear filters" }).length,
    ).toBeGreaterThan(0);
  });
});
