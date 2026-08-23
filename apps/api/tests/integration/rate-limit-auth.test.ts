import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

const namespace = vi.hoisted(() => {
  const value = `rl-auth-${Math.random().toString(36).slice(2)}`;

  process.env["RATE_LIMIT_NAMESPACE"] = value;
  process.env["RATE_LIMIT_AUTH_POINTS"] = "3";

  return value;
});

const { app } = await import("../../src/app.js");
const { redis } = await import("../../src/redis.js");
const { requireTestDatabase } = await import("../setup.js");

const password = "correct horse battery staple";

function attempt() {
  return request(app)
    .post("/api/auth/sign-in/email")
    .send({ email: "nobody@example.com", password });
}

describe("the auth bucket is per-IP and strict", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("rejects the fourth attempt from one address", async () => {
    for (let index = 0; index < 3; index += 1) {
      expect((await attempt()).status).not.toBe(429);
    }

    const rejected = await attempt();

    expect(rejected.status).toBe(429);
    expect(rejected.body).toMatchObject({
      error: { code: "RATE_LIMITED", details: { bucket: "auth" } },
    });
    expect(rejected.get("retry-after")).toBe("60");
  });

  it("keeps its counter in Redis under the configured namespace", async () => {
    await attempt();

    const keys = await redis.keys(`${namespace}:auth:*`);

    expect(keys.length).toBeGreaterThan(0);
  });
});
