import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";

const { execute } = vi.hoisted(() => ({
  execute: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("../../src/db/index.js", () => ({ db: { execute } }));

describe("GET /readyz", () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it("reports ready when the pool answers", async () => {
    execute.mockResolvedValue([{ "?column?": 1 }]);

    const res = await request(app).get("/readyz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ postgres: "ok" });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("reports 503 when the pool does not answer", async () => {
    execute.mockRejectedValue(new Error("connection refused"));

    const res = await request(app).get("/readyz");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ postgres: "error" });
  });
});
