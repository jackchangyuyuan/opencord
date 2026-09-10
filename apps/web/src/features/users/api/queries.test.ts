import type { PublicUser } from "@opencord/shared/types";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { userQuery } from "./queries";

function user(id: string): PublicUser {
  return {
    id,
    username: id,
    name: id,
    avatarUrl: null,
    description: null,
    customStatus: null,
    customStatusEmoji: null,
    isGuest: false,
  };
}

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function pathsOf(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([path]) => String(path));
}

describe("looking a person up", () => {
  it("gathers a tick's worth of lookups into one request", async () => {
    const fetchMock = vi.fn((path: string) => {
      const ids = new URL(path, "http://localhost").searchParams.get("ids");

      return Promise.resolve(
        respond(
          200,
          (ids ?? "").split(",").map((id) => user(id)),
        ),
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    const people = await Promise.all([
      client.query(userQuery("u-ada")),
      client.query(userQuery("u-grace")),
    ]);

    expect(people.map((entry) => entry.id)).toEqual(["u-ada", "u-grace"]);
    expect(pathsOf(fetchMock)).toEqual(["/api/v1/users?ids=u-ada,u-grace"]);
  });

  it("asks individually for whoever a successful batch left out", async () => {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(
        path.includes("?ids=")
          ? respond(200, [user("u-ada")])
          : respond(404, {
              error: { code: "NOT_FOUND", message: "Resource not found" },
            }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const found = client.query(userQuery("u-ada"));
    const missing = client.query(userQuery("u-gone"));

    await expect(found).resolves.toMatchObject({ id: "u-ada" });
    await expect(missing).rejects.toThrow();

    expect(pathsOf(fetchMock)).toEqual([
      "/api/v1/users?ids=u-ada,u-gone",
      "/api/v1/users/u-gone",
    ]);
  });

  it("fails the whole batch rather than retrying it one person at a time", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        respond(503, {
          error: { code: "UNAVAILABLE", message: "Try again later" },
        }),
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const lookups = ["u-ada", "u-grace", "u-hopper"].map((id) =>
      client.query(userQuery(id)),
    );

    await expect(Promise.allSettled(lookups)).resolves.toEqual([
      expect.objectContaining({ status: "rejected" }),
      expect.objectContaining({ status: "rejected" }),
      expect.objectContaining({ status: "rejected" }),
    ]);

    expect(pathsOf(fetchMock)).toEqual([
      "/api/v1/users?ids=u-ada,u-grace,u-hopper",
    ]);
  });
});
