import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { app } from "../../src/app.js";

const { execute, ping } = vi.hoisted(() => ({
  execute: vi.fn<() => Promise<unknown>>(),
  ping: vi.fn<() => Promise<string>>(),
}));

vi.mock("../../src/db/index.js", () => ({ db: { execute } }));
vi.mock("../../src/redis.js", () => ({ redis: { ping } }));

describe("GET /readyz", () => {
  beforeEach(() => {
    execute.mockReset();
    ping.mockReset();
    execute.mockResolvedValue([{ "?column?": 1 }]);
    ping.mockResolvedValue("PONG");
  });

  it("reports ready when both dependencies answer", async () => {
    const res = await request(app).get("/readyz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ postgres: "ok", redis: "ok" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("reports 503 when the pool does not answer", async () => {
    execute.mockRejectedValue(new Error("connection refused"));

    const res = await request(app).get("/readyz");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ postgres: "error", redis: "ok" });
  });

  it("reports 503 when Redis does not answer", async () => {
    ping.mockRejectedValue(new Error("connection refused"));

    const res = await request(app).get("/readyz");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ postgres: "ok", redis: "error" });
  });
});
