import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { auth } from "../../src/auth.js";

describe("the security headers this application sends", () => {
  it("leaves every document-level header to the proxy", async () => {
    const res = await request(app).get("/livez");

    for (const header of [
      "content-security-policy",
      "strict-transport-security",
      "x-frame-options",
      "referrer-policy",
      "x-content-type-options",
    ]) {
      expect(res.headers).not.toHaveProperty(header);
    }
  });

  it("sends the headers that are only ever about an API response", async () => {
    const res = await request(app).get("/livez");

    expect(res.headers["x-dns-prefetch-control"]).toBe("off");
    expect(res.headers["x-permitted-cross-domain-policies"]).toBe("none");
  });

  it("does not announce the framework", async () => {
    const res = await request(app).get("/livez");

    expect(res.headers).not.toHaveProperty("x-powered-by");
  });
});

describe("rate limiting has a single owner", () => {
  it("leaves Better Auth's own limiter off", () => {
    expect(auth.options.rateLimit.enabled).toBe(false);
  });
});
