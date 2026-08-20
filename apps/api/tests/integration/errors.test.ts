import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });

async function signUp(username: string): Promise<string[]> {
  const res = await request(app)
    .post("/api/auth/sign-up/email")
    .send({
      email: `${username}@example.com`,
      name: username,
      password,
      username,
    });

  expect(res.status).toBe(200);
  signUpBody.parse(res.body);

  return res.get("Set-Cookie") ?? [];
}

describe("the error envelope", () => {
  it("returns NOT_FOUND for an unmatched API route", async () => {
    const res = await request(app).get("/api/nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: "Resource not found" },
    });
  });

  it("returns the same envelope for any unmatched path", async () => {
    const res = await request(app).get("/nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", message: "Resource not found" },
    });
  });

  it("still returns the request id header on a failure", async () => {
    const res = await request(app).get("/api/nope");

    expect(res.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe("a request body the parser refuses", () => {
  beforeAll(requireTestDatabase);

  it("answers 400 rather than 500 for malformed JSON", async () => {
    const cookies = await signUp("ada");

    const res = await request(app)
      .post("/api/v1/servers")
      .set("Cookie", cookies)
      .set("Content-Type", "application/json")
      .send('{"name": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: "MALFORMED_BODY", message: "Request body is not valid" },
    });
  });

  it("answers 415 for a content encoding it cannot read", async () => {
    const cookies = await signUp("ada");

    const res = await request(app)
      .post("/api/v1/servers")
      .set("Cookie", cookies)
      .set("Content-Type", "application/json")
      .set("Content-Encoding", "compress")
      .send('{"name":"compressed"}');

    expect(res.status).toBe(415);
    expect(res.body).toEqual({
      error: {
        code: "UNSUPPORTED_ENCODING",
        message: "Request body uses an unsupported content encoding",
      },
    });
  });

  it("answers 415 for a charset it cannot read", async () => {
    const cookies = await signUp("ada");

    const res = await request(app)
      .post("/api/v1/servers")
      .set("Cookie", cookies)
      .set("Content-Type", "application/json; charset=iso-8859-59")
      .send('{"name":"exotic"}');

    expect(res.status).toBe(415);
    expect(res.body).toEqual({
      error: {
        code: "UNSUPPORTED_CHARSET",
        message: "Request body uses an unsupported charset",
      },
    });
  });

  it("answers 413 for a body past the parser's limit", async () => {
    const cookies = await signUp("ada");

    const res = await request(app)
      .post("/api/v1/servers")
      .set("Cookie", cookies)
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ name: "x".repeat(200_000) }));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { code: "BODY_TOO_LARGE", message: "Request body is too large" },
    });
  });
});
