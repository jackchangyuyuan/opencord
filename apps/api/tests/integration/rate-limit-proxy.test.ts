import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

const namespace = vi.hoisted(() => {
  const value = `rl-proxy-${Math.random().toString(36).slice(2)}`;

  process.env["RATE_LIMIT_NAMESPACE"] = value;
  process.env["RATE_LIMIT_AUTH_POINTS"] = "2";
  process.env["TRUST_PROXY_HOPS"] = "1";

  return value;
});

const { app } = await import("../../src/app.js");
const { redis } = await import("../../src/redis.js");
const { requireTestDatabase } = await import("../setup.js");

const password = "correct horse battery staple";

function attempt(forwardedFor: string) {
  return request(app)
    .post("/api/auth/sign-in/email")
    .set("X-Forwarded-For", forwardedFor)
    .send({ email: "nobody@example.com", password });
}

describe("the auth bucket meters the client, not the proxy", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("gives each forwarded address its own budget", async () => {
    expect((await attempt("203.0.113.7")).status).not.toBe(429);
    expect((await attempt("203.0.113.7")).status).not.toBe(429);
    expect((await attempt("203.0.113.7")).status).toBe(429);

    expect((await attempt("203.0.113.8")).status).not.toBe(429);

    expect(await redis.get(`${namespace}:auth:203.0.113.7`)).toBe("3");
    expect(await redis.get(`${namespace}:auth:203.0.113.8`)).toBe("1");
  });
});
