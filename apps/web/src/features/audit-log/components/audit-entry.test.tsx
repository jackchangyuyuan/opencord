import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AuditAction,
  AuditLogEntry,
} from "@/features/audit-log/api/queries";
import { AuditLogTab } from "@/features/audit-log/components/audit-log-tab";
import { ACTION_COPY } from "@/features/audit-log/lib/actions";

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

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
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

      if (url.includes("/users/")) {
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

      if (url.endsWith(`/servers/${SERVER_ID}`)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: SERVER_ID,
              name: "Analytical Engine",
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
              roles: [],
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

beforeEach(() => {
  permissions = Permissions.VIEW_CHANNEL | Permissions.MANAGE_SERVER;
  auditStatus = 200;
  entries = [entry()];

  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuditEntry", () => {
  it("renders per-action copy rather than the raw enum", async () => {
    render(
      <QueryClientProvider client={client()}>
        <ul>
          <AuditEntry entry={entry()} />
        </ul>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("banned a member")).toBeInTheDocument();
    expect(screen.queryByText("member_ban")).not.toBeInTheDocument();
  });

  it("has copy for every action the API can emit", () => {
    const actions = Object.keys(ACTION_COPY) as AuditAction[];

    expect(actions).toHaveLength(20);

    for (const action of actions) {
      expect(ACTION_COPY[action]).not.toBe("");
    }
  });
});

describe("AuditLogTab", () => {
  it("lists the record reverse-chronologically as the server ordered it", async () => {
    entries = [
      entry({ id: "a-2", action: "channel_create" }),
      entry({ id: "a-1", action: "member_ban" }),
    ];

    render(
      <QueryClientProvider client={client()}>
        <AuditLogTab serverId={SERVER_ID} />
      </QueryClientProvider>,
    );

    const rows = await screen.findAllByRole("listitem");

    expect(rows[0]).toHaveTextContent("created a channel");
    expect(rows[1]).toHaveTextContent("banned a member");
  });

  it("calls it a moderation record, not an audit log", async () => {
    render(
      <QueryClientProvider client={client()}>
        <AuditLogTab serverId={SERVER_ID} />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("This server’s moderation record, newest first."),
    ).toBeInTheDocument();
  });

  it("renders nothing for a member without MANAGE_SERVER", async () => {
    permissions = Permissions.VIEW_CHANNEL;

    const { container } = render(
      <QueryClientProvider client={client()}>
        <AuditLogTab serverId={SERVER_ID} />
      </QueryClientProvider>,
    );

    await Promise.resolve();

    expect(container).toBeEmptyDOMElement();
  });

  it("says so when the API refuses anyway", async () => {
    auditStatus = 403;

    render(
      <QueryClientProvider client={client()}>
        <AuditLogTab serverId={SERVER_ID} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not load this server’s moderation record.",
    );
  });

  it("offers no filters, only the plain reverse-chronological list", async () => {
    render(
      <QueryClientProvider client={client()}>
        <AuditLogTab serverId={SERVER_ID} />
      </QueryClientProvider>,
    );

    await screen.findAllByRole("listitem");

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
