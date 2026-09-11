import { Permissions } from "@opencord/shared/permissions";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type PublicRole,
  serverRolesQueryKey,
} from "@/features/roles/api/queries";

import { useReorderRoles } from "./use-reorder-roles";

const SERVER_ID = "11111111-1111-4111-8111-111111111111";

const EVERYONE: PublicRole = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "@everyone",
  color: null,
  position: 0,
  permissions: Permissions.VIEW_CHANNEL,
  isDefault: true,
};

const role = (id: string, name: string, position: number): PublicRole => ({
  id,
  name,
  color: null,
  position,
  permissions: 0,
  isDefault: false,
});

const JUNIOR = role("44444444-4444-4444-8444-444444444444", "Junior", 1);
const MIDDLE = role("55555555-5555-4555-8555-555555555555", "Middle", 2);
const SENIOR = role("66666666-6666-4666-8666-666666666666", "Senior", 3);

let requests: { url: string; method: string; body: unknown }[];
let respond: () => Response;

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: { method?: string; body?: string }) => {
      requests.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body === undefined ? null : JSON.parse(init.body),
      });

      return Promise.resolve(respond());
    }),
  );
}

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  client.setQueryData<PublicRole[]>(serverRolesQueryKey(SERVER_ID), [
    EVERYONE,
    JUNIOR,
    MIDDLE,
    SENIOR,
  ]);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return {
    client,
    ...renderHook(() => useReorderRoles(SERVER_ID), { wrapper }),
  };
}

const namesAndRanks = (client: QueryClient) =>
  (client.getQueryData<PublicRole[]>(serverRolesQueryKey(SERVER_ID)) ?? []).map(
    (entry) => `${entry.name}:${String(entry.position)}`,
  );

beforeEach(() => {
  requests = [];
  respond = () => new Response("{}");
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useReorderRoles", () => {
  it("sends the submitted order to the one order endpoint", async () => {
    const { result } = harness();

    act(() => {
      result.current.reorder([MIDDLE.id, JUNIOR.id, SENIOR.id]);
    });

    await waitFor(() => {
      expect(requests[0]).toMatchObject({
        url: `/api/v1/servers/${SERVER_ID}/roles/positions`,
        method: "PATCH",
        body: { roleIds: [MIDDLE.id, JUNIOR.id, SENIOR.id] },
      });
    });
  });

  it("moves the list optimistically and renumbers from one", async () => {
    const { client, result } = harness();

    act(() => {
      result.current.reorder([MIDDLE.id, JUNIOR.id, SENIOR.id]);
    });

    await waitFor(() => {
      expect(namesAndRanks(client)).toEqual([
        "@everyone:0",
        "Middle:1",
        "Junior:2",
        "Senior:3",
      ]);
    });
  });

  it("leaves a role that was not submitted in its own slot", async () => {
    const { client, result } = harness();

    act(() => {
      result.current.reorder([MIDDLE.id, JUNIOR.id]);
    });

    await waitFor(() => {
      expect(namesAndRanks(client)).toEqual([
        "@everyone:0",
        "Middle:1",
        "Junior:2",
        "Senior:3",
      ]);
    });
  });

  it("puts the old order back when the server refuses", async () => {
    respond = () =>
      new Response(
        JSON.stringify({
          error: { code: "ROLE_HIERARCHY", message: "Above your highest role" },
        }),
        { status: 403 },
      );

    const { client, result } = harness();

    act(() => {
      result.current.reorder([SENIOR.id, MIDDLE.id, JUNIOR.id]);
    });

    await waitFor(() => {
      expect(namesAndRanks(client)).toEqual([
        "@everyone:0",
        "Junior:1",
        "Middle:2",
        "Senior:3",
      ]);
    });
  });
});
