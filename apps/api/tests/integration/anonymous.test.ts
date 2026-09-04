import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { config } from "../../src/config.js";
import { db } from "../../src/db/index.js";
import { requireTestDatabase } from "../setup.js";

const signInBody = z.object({ user: z.object({ id: z.string() }) });

async function signInAnonymously() {
  const res = await request(app).post("/api/auth/sign-in/anonymous").send({});

  expect(res.status).toBe(200);

  return {
    id: signInBody.parse(res.body).user.id,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

describe("anonymous guest identity", () => {
  beforeAll(requireTestDatabase);

  it("mints a guest-shaped username and an expiry, in one hook", async () => {
    const before = Date.now();
    const guest = await signInAnonymously();

    const row = await db.query.users.findFirst({
      columns: {
        username: true,
        isAnonymous: true,
        guestExpiresAt: true,
        deactivatedAt: true,
      },
      where: { id: guest.id },
    });

    expect(row?.isAnonymous).toBe(true);
    expect(row?.username).toMatch(/^guest-[0-9a-f]{16}$/);
    expect(row?.deactivatedAt).toBeNull();

    const expiresAt = row?.guestExpiresAt?.getTime() ?? 0;

    expect(expiresAt).toBeGreaterThanOrEqual(
      before + config.GUEST_TTL_MS - 5000,
    );
    expect(expiresAt).toBeLessThanOrEqual(
      Date.now() + config.GUEST_TTL_MS + 5000,
    );
  });

  it("gives every guest a different username", async () => {
    const first = await signInAnonymously();
    const second = await signInAnonymously();

    const rows = await db.query.users.findMany({
      columns: { id: true, username: true },
      where: { id: { in: [first.id, second.id] } },
    });

    expect(new Set(rows.map((row) => row.username)).size).toBe(2);
  });

  it("carries a real session the rest of the API accepts", async () => {
    const guest = await signInAnonymously();

    const me = await request(app)
      .get("/api/v1/users/@me")
      .set("Cookie", guest.cookies);

    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: guest.id });
  });

  it("leaves a registered account unmarked and non-expiring", async () => {
    const res = await request(app).post("/api/auth/sign-up/email").send({
      email: "ada@example.com",
      name: "ada",
      password: "correct horse battery staple",
      username: "ada",
    });

    expect(res.status).toBe(200);

    const row = await db.query.users.findFirst({
      columns: { isAnonymous: true, guestExpiresAt: true },
      where: { username: "ada" },
    });

    expect(row?.isAnonymous).toBe(false);
    expect(row?.guestExpiresAt).toBeNull();
  });

  it("refuses a sign-up that tries to look like a guest", async () => {
    const res = await request(app).post("/api/auth/sign-up/email").send({
      email: "impostor@example.com",
      name: "impostor",
      password: "correct horse battery staple",
      username: "guest-deadbeefdeadbeef",
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("refuses the plugin's delete route and keeps the account", async () => {
    const guest = await signInAnonymously();

    const res = await request(app)
      .post("/api/auth/delete-anonymous-user")
      .set("Cookie", guest.cookies)
      .send({});

    expect(res.status).toBeGreaterThanOrEqual(400);

    const row = await db.query.users.findFirst({
      columns: { id: true },
      where: { id: guest.id },
    });

    expect(row?.id).toBe(guest.id);
  });
});
