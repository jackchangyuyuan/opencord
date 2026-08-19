import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { users } from "../../src/db/schema/index.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });

interface Account {
  id: string;
  cookies: string[];
}

async function signUp(username: string, name: string): Promise<Account> {
  const res = await request(app)
    .post("/api/auth/sign-up/email")
    .send({
      email: `${username}@example.com`,
      name,
      password,
      username,
    });

  expect(res.status).toBe(200);

  return {
    id: signUpBody.parse(res.body).user.id,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

describe("the session gate on /api/v1", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/users/@me");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
  });

  it("gates paths the v1 router does not route", async () => {
    const res = await request(app).get("/api/v1/nothing-here");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("falls through to 404 once the gate is passed", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await request(app)
      .get("/api/v1/nothing-here")
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("rejects a deactivated user", async () => {
    const ada = await signUp("ada", "Ada");

    await db
      .update(users)
      .set({ deactivatedAt: new Date() })
      .where(eq(users.id, ada.id));

    const res = await request(app)
      .get("/api/v1/users/@me")
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: "SESSION_EXPIRED", message: "Session expired" },
    });
  });

  it("rejects a past guest expiry without the expiry job having run", async () => {
    const ada = await signUp("ada", "Ada");

    await db
      .update(users)
      .set({ guestExpiresAt: minutesFromNow(-1) })
      .where(eq(users.id, ada.id));

    const res = await request(app)
      .get("/api/v1/users/@me")
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: "SESSION_EXPIRED" } });

    const stored = await db.query.users.findFirst({
      columns: { deactivatedAt: true },
      where: { id: ada.id },
    });

    expect(stored?.deactivatedAt).toBeNull();
  });

  it("admits a guest whose expiry is still in the future", async () => {
    const ada = await signUp("ada", "Ada");

    await db
      .update(users)
      .set({ guestExpiresAt: minutesFromNow(60) })
      .where(eq(users.id, ada.id));

    const res = await request(app)
      .get("/api/v1/users/@me")
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: "ada" });
  });
});

describe("the users routes", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("serves the session user at /users/@me", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await request(app)
      .get("/api/v1/users/@me")
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: ada.id,
      username: "ada",
      name: "Ada",
      avatarUrl: null,
    });
  });

  it("serves another user by id in the same shape", async () => {
    const ada = await signUp("ada", "Ada");
    const grace = await signUp("grace", "Grace");

    const res = await request(app)
      .get(`/api/v1/users/${grace.id}`)
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: grace.id,
      username: "grace",
      name: "Grace",
      avatarUrl: null,
    });
  });

  it("answers 404 for an unknown user id", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await request(app)
      .get("/api/v1/users/nobody")
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "NOT_FOUND" } });
  });
});
