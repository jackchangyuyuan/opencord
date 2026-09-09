import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { type Account, signUp } from "../helpers/accounts.js";

const namespace = vi.hoisted(() => {
  const value = `rl-create-${Math.random().toString(36).slice(2)}`;

  process.env["RATE_LIMIT_NAMESPACE"] = value;
  process.env["RATE_LIMIT_CREATE_POINTS"] = "3";
  process.env["RATE_LIMIT_INVITE_POINTS"] = "2";

  return value;
});

const { app } = await import("../../src/app.js");
const { redis } = await import("../../src/redis.js");
const { requireTestDatabase } = await import("../setup.js");

const serverBody = z.object({ id: z.string() });

function createServer(account: Account, name: string) {
  return request(app)
    .post("/api/v1/servers")
    .set("Cookie", account.cookies)
    .send({ name });
}

function createChannel(account: Account, serverId: string, name: string) {
  return request(app)
    .post(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", account.cookies)
    .send({ name, type: "text" });
}

function createRole(account: Account, serverId: string, name: string) {
  return request(app)
    .post(`/api/v1/servers/${serverId}/roles`)
    .set("Cookie", account.cookies)
    .send({ name });
}

function counterFor(userId: string): Promise<string | null> {
  return redis.get(`${namespace}:create:${userId}`);
}

describe("the creation bucket", () => {
  beforeAll(requireTestDatabase);

  it("rejects the fourth creation inside the window", async () => {
    const ada = await signUp("rlc-ada");

    for (let index = 0; index < 3; index += 1) {
      expect((await createServer(ada, `server ${String(index)}`)).status).toBe(
        201,
      );
    }

    const rejected = await createServer(ada, "one too many");

    expect(rejected.status).toBe(429);
    expect(rejected.body).toMatchObject({
      error: { code: "RATE_LIMITED", details: { bucket: "create" } },
    });
    expect(rejected.get("retry-after")).toBe("60");
    expect(await counterFor(ada.id)).toBe("4");
  });

  it("shares one budget between servers, channels and roles", async () => {
    const ada = await signUp("rlc-grace");

    const created = await createServer(ada, "Shared budget");

    expect(created.status).toBe(201);

    const serverId = serverBody.parse(created.body).id;

    expect((await createChannel(ada, serverId, "one")).status).toBe(201);
    expect((await createRole(ada, serverId, "Two")).status).toBe(201);

    expect((await createChannel(ada, serverId, "four")).status).toBe(429);
    expect((await createRole(ada, serverId, "Four")).status).toBe(429);
  });

  it("meters each user separately", async () => {
    const ada = await signUp("rlc-hopper");
    const grace = await signUp("rlc-lovelace");

    for (let index = 0; index < 4; index += 1) {
      await createServer(ada, `theirs ${String(index)}`);
    }

    expect((await createServer(grace, "mine")).status).toBe(201);
    expect(await counterFor(grace.id)).toBe("1");
  });

  it("counts nothing for a request rejected before the limiter", async () => {
    const ada = await signUp("rlc-babbage");
    const stranger = await signUp("rlc-turing");

    const created = await createServer(ada, "Not yours");

    expect(created.status).toBe(201);

    const res = await createChannel(
      stranger,
      serverBody.parse(created.body).id,
      "intruder",
    );

    expect(res.status).toBe(403);
    expect(await counterFor(stranger.id)).toBeNull();
  });
});

describe("the invite-redemption bucket", () => {
  it("rejects the third redemption attempt from one address", async () => {
    const ada = await signUp("rlc-invite");

    for (let index = 0; index < 2; index += 1) {
      const res = await request(app)
        .post("/api/v1/invites/nosuch01")
        .set("Cookie", ada.cookies);

      expect(res.status).toBe(404);
    }

    const rejected = await request(app)
      .post("/api/v1/invites/nosuch01")
      .set("Cookie", ada.cookies);

    expect(rejected.status).toBe(429);
    expect(rejected.body).toMatchObject({
      error: { code: "RATE_LIMITED", details: { bucket: "invite" } },
    });
  });

  it("leaves the public preview unmetered", async () => {
    const ada = await signUp("rlc-preview");

    for (let index = 0; index < 4; index += 1) {
      const res = await request(app)
        .get("/api/v1/invites/nosuch02")
        .set("Cookie", ada.cookies);

      expect(res.status).toBe(404);
    }
  });
});
