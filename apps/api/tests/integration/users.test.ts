import {
  CUSTOM_STATUS_MAX_LENGTH,
  DESCRIPTION_MAX_LENGTH,
} from "@opencord/shared/constants";
import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { users } from "../../src/db/schema/index.js";
import { type Account, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

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
      description: null,
      customStatus: null,
      customStatusEmoji: null,
      isGuest: false,
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
      description: null,
      customStatus: null,
      customStatusEmoji: null,
      isGuest: false,
    });
  });

  it("distinguishes the unique username from the display name", async () => {
    const ada = await signUp("ada", "Ada Lovelace");

    const taken = await request(app).post("/api/auth/sign-up/email").send({
      email: "other@example.com",
      name: "Ada Lovelace",
      password,
      username: "ada",
    });

    expect(taken.status).toBe(422);

    const second = await signUp("lovelace", "Ada Lovelace");

    const mine = await request(app)
      .get(`/api/v1/users/${second.id}`)
      .set("Cookie", ada.cookies);

    expect(mine.body).toMatchObject({
      username: "lovelace",
      name: "Ada Lovelace",
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

  it("serves several users in one lookup", async () => {
    const ada = await signUp("ada", "Ada");
    const grace = await signUp("grace", "Grace");
    const linus = await signUp("linus", "Linus");

    const res = await request(app)
      .get(`/api/v1/users?ids=${grace.id},${linus.id}`)
      .set("Cookie", ada.cookies);

    const found = res.body as { username: string; avatarUrl: string | null }[];

    expect(res.status).toBe(200);
    expect(found.map((user) => user.username).sort()).toEqual([
      "grace",
      "linus",
    ]);
    expect(found[0]).toMatchObject({ avatarUrl: null, description: null });
  });

  it("leaves out an id that matches nobody", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await request(app)
      .get(`/api/v1/users?ids=nobody,${ada.id}`)
      .set("Cookie", ada.cookies);

    const found = res.body as { id: string }[];

    expect(res.status).toBe(200);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: ada.id });
  });

  it("refuses a lookup with no ids in it", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await request(app)
      .get("/api/v1/users?ids=")
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(400);
  });
});

function patchProfile(account: Account, body: object) {
  return request(app)
    .patch("/api/v1/users/@me")
    .set("Cookie", account.cookies)
    .send(body);
}

describe("the profile fields", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("stores a description and a custom status and serves them back", async () => {
    const ada = await signUp("ada", "Ada");

    const saved = await patchProfile(ada, {
      description: "Computer Science @ Waterloo",
      customStatus: "shipping bugs",
      customStatusEmoji: "🐛",
    });

    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      description: "Computer Science @ Waterloo",
      customStatus: "shipping bugs",
      customStatusEmoji: "🐛",
    });

    const grace = await signUp("grace", "Grace");

    const read = await request(app)
      .get(`/api/v1/users/${ada.id}`)
      .set("Cookie", grace.cookies);

    expect(read.body).toMatchObject({
      description: "Computer Science @ Waterloo",
      customStatus: "shipping bugs",
      customStatusEmoji: "🐛",
    });
  });

  it("keeps a field the request omits", async () => {
    const ada = await signUp("ada", "Ada");

    await patchProfile(ada, { description: "Building distributed systems." });

    const res = await patchProfile(ada, { customStatus: "in class" });

    expect(res.body).toMatchObject({
      description: "Building distributed systems.",
      customStatus: "in class",
    });
  });

  it("clears a field the request sends as null", async () => {
    const ada = await signUp("ada", "Ada");

    await patchProfile(ada, {
      description: "Full-stack developer",
      customStatus: "heads down",
      customStatusEmoji: "☕",
    });

    const res = await patchProfile(ada, {
      description: null,
      customStatus: null,
      customStatusEmoji: null,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      description: null,
      customStatus: null,
      customStatusEmoji: null,
      isGuest: false,
    });
  });

  it("treats text that normalizes to nothing as a clear", async () => {
    const ada = await signUp("ada", "Ada");

    await patchProfile(ada, { description: "Reviewing PRs" });

    const res = await patchProfile(ada, { description: "   \n  \n " });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ description: null });
  });

  it("keeps the lines of a multiline description and collapses the gaps", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await patchProfile(ada, {
      description: "  Waterloo CS   \n\n\n\nDistributed systems.  ",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      description: "Waterloo CS\n\nDistributed systems.",
    });
  });

  it("flattens a custom status onto one line", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await patchProfile(ada, { customStatus: "working\non auth" });

    expect(res.body).toMatchObject({ customStatus: "working on auth" });
  });

  it("refuses a description longer than the shared maximum", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await patchProfile(ada, {
      description: "x".repeat(DESCRIPTION_MAX_LENGTH + 1),
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });

  it("accepts a description of exactly the shared maximum", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await patchProfile(ada, {
      description: "x".repeat(DESCRIPTION_MAX_LENGTH),
    });

    expect(res.status).toBe(200);
  });

  it("refuses a custom status longer than the shared maximum", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await patchProfile(ada, {
      customStatus: "x".repeat(CUSTOM_STATUS_MAX_LENGTH + 1),
    });

    expect(res.status).toBe(400);
  });

  it("refuses a status emoji that is not an emoji", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await patchProfile(ada, { customStatusEmoji: "nope" });

    expect(res.status).toBe(400);
  });

  it("refuses a request that names no field at all", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await patchProfile(ada, {});

    expect(res.status).toBe(400);
  });

  it("edits only the caller's own profile", async () => {
    const ada = await signUp("ada", "Ada");
    const grace = await signUp("grace", "Grace");

    await patchProfile(grace, { description: "Grace wrote this" });

    await patchProfile(ada, { description: "Ada wrote this" });

    const hers = await request(app)
      .get(`/api/v1/users/${grace.id}`)
      .set("Cookie", ada.cookies);

    expect(hers.body).toMatchObject({ description: "Grace wrote this" });

    const patchOther = await request(app)
      .patch(`/api/v1/users/${grace.id}`)
      .set("Cookie", ada.cookies)
      .send({ description: "not yours" });

    expect(patchOther.status).toBe(404);
  });

  it("refuses an unauthenticated profile edit", async () => {
    const res = await request(app)
      .patch("/api/v1/users/@me")
      .send({ description: "anybody" });

    expect(res.status).toBe(401);
  });
});
