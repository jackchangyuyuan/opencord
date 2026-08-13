import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { errorHandler } from "../../src/middleware/error.js";
import { httpLogger } from "../../src/middleware/http-logger.js";

const app = express();

app.use(httpLogger);

app.get("/boom", () => {
  throw new Error("secret internal detail");
});

app.use(errorHandler);

describe("the internal error envelope", () => {
  it("leaks nothing from an unexpected error", async () => {
    const res = await request(app).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: "INTERNAL", message: "Internal server error" },
    });
  });

  it("correlates through the header rather than the body", async () => {
    const res = await request(app).get("/boom");

    expect(res.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(JSON.stringify(res.body)).not.toContain("requestId");
  });
});
