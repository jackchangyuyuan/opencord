import request from "supertest";
import { describe, expect, it } from "vitest";

import { app } from "../../src/app.js";

describe("GET /livez", () => {
  it("reports liveness with no dependencies", async () => {
    const res = await request(app).get("/livez");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
