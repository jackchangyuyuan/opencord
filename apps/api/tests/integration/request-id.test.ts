import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../../src/app.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("request IDs", () => {
  it("returns the generated id in a response header", async () => {
    const res = await request(app).get("/livez");

    expect(res.get("x-request-id")).toMatch(UUID);
  });

  it("generates a distinct id for every request", async () => {
    const [first, second] = await Promise.all([
      request(app).get("/livez"),
      request(app).get("/livez"),
    ]);

    expect(first.get("x-request-id")).not.toBe(second.get("x-request-id"));
  });
});
