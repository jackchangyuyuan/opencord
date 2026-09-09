import { sql } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { auth } from "../../src/auth.js";
import { db } from "../../src/db/index.js";
import { requireTestDatabase } from "../setup.js";

const email = "ada@example.com";
const password = "correct horse battery staple";
const username = "ada";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });

function signUp(overrides: Record<string, string> = {}) {
  return request(app)
    .post("/api/auth/sign-up/email")
    .send({ email, name: "Ada", password, username, ...overrides });
}

function cookiesOf(res: request.Response): string[] {
  return res.get("Set-Cookie") ?? [];
}

describe("Better Auth email and password", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("stores the user and a credential account on sign-up", async () => {
    const res = await signUp();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: { email, name: "Ada", username } });

    const stored = await db.query.users.findFirst({
      columns: { email: true, emailVerified: true, username: true },
      with: { accounts: { columns: { issuer: true, providerId: true } } },
    });

    expect(stored).toEqual({
      email,
      emailVerified: false,
      username,
      accounts: [{ issuer: "local:credential", providerId: "credential" }],
    });
  });

  it("returns a session cookie that resolves to the signed-up user", async () => {
    const created = await signUp();
    const cookies = cookiesOf(created);

    expect(cookies).not.toHaveLength(0);

    const res = await request(app)
      .get("/api/auth/get-session")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      session: { userId: signUpBody.parse(created.body).user.id },
      user: { email, username },
    });
  });

  it("signs in with the right password", async () => {
    await signUp();

    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: { email } });
    expect(cookiesOf(res)).not.toHaveLength(0);
  });

  it("rejects the wrong password", async () => {
    await signUp();

    const res = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email, password: "not the password" });

    expect(res.status).toBe(401);
    expect(cookiesOf(res)).toHaveLength(0);
  });

  it("resolves no session without a cookie", async () => {
    const res = await request(app).get("/api/auth/get-session");

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });
});

describe("the username column", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("is required on sign-up", async () => {
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ email, name: "Ada", password });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "MISSING_FIELD" });
    expect(await db.query.users.findMany({})).toHaveLength(0);
  });

  it("is unique, and the database is what rejects a duplicate", async () => {
    expect((await signUp()).status).toBe(200);

    const res = await signUp({ email: "grace@example.com" });

    expect(res.status).toBe(422);
    expect(await db.query.users.findMany({})).toHaveLength(1);
  });

  it("refuses a reserved prefix through the update endpoint", async () => {
    const created = await signUp();

    expect(created.status).toBe(200);

    for (const attempt of ["guest-deadbeefdeadbeef", "former-guest-x", "A B"]) {
      const res = await request(app)
        .post("/api/auth/update-user")
        .set("Cookie", cookiesOf(created))
        .send({ username: attempt });

      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: "INVALID_USERNAME" });
    }

    const row = await db.query.users.findFirst({
      columns: { username: true },
    });

    expect(row?.username).toBe(username);
  });

  it("still accepts a valid username through the update endpoint", async () => {
    const created = await signUp();

    const res = await request(app)
      .post("/api/auth/update-user")
      .set("Cookie", cookiesOf(created))
      .send({ username: "ada-lovelace" });

    expect(res.status).toBe(200);

    const row = await db.query.users.findFirst({
      columns: { username: true },
    });

    expect(row?.username).toBe("ada-lovelace");
  });

  // The shared schema trims and lowercases, so the spelling that reaches the
  // column has to be the one it returns. Stored as it arrived, the unique index
  // would be on a casing rather than on a name.
  it("stores the canonical spelling a direct sign-up asked for", async () => {
    const res = await signUp({ username: "  AdaLovelace  " });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ user: { username: "adalovelace" } });

    const row = await db.query.users.findFirst({ columns: { username: true } });

    expect(row?.username).toBe("adalovelace");
  });

  it("refuses a second account whose username differs only in casing", async () => {
    expect((await signUp({ username: "ada" })).status).toBe(200);

    const res = await signUp({
      email: "grace@example.com",
      username: "  ADA ",
    });

    expect(res.status).toBe(422);
    expect(await db.query.users.findMany({})).toHaveLength(1);
  });

  it("canonicalises a username set through the update endpoint", async () => {
    const created = await signUp();

    const res = await request(app)
      .post("/api/auth/update-user")
      .set("Cookie", cookiesOf(created))
      .send({ username: "  Ada.Lovelace " });

    expect(res.status).toBe(200);

    const row = await db.query.users.findFirst({ columns: { username: true } });

    expect(row?.username).toBe("ada.lovelace");
  });

  it("is guest-shaped for an anonymous creator", async () => {
    const { internalAdapter } = await auth.$context;

    const user = await internalAdapter.createUser(
      {
        email: "anonymous@example.com",
        emailVerified: false,
        isAnonymous: true,
        name: "Anonymous",
      },
      { method: "anonymous" },
    );

    expect(user["username"]).toMatch(/^guest-[0-9a-f]{16}$/);
    expect(user["username"]).toMatch(/^[a-z0-9_.-]{3,32}$/);
  });

  it("is derived from the profile for a social creator", async () => {
    const { internalAdapter } = await auth.$context;

    const user = await internalAdapter.createUser(
      {
        email: "hopper@example.com",
        emailVerified: true,
        name: "Grace Hopper",
      },
      { method: "oauth" },
    );

    expect(user["username"]).toBe("hopper");
  });
});

// Better Auth 1.7.0 through 1.7.2 generated this column and the installed
// version no longer writes it. A NOT NULL here is a schema Better Auth refuses:
// it warns in development and throws SchemaMismatchError on every request in
// production, which is the whole API down rather than one failed insert.
describe("the account table Better Auth writes", () => {
  it("does not require a column Better Auth never fills", async () => {
    const [row] = await db.execute<{ is_nullable: string }>(sql`
      select is_nullable
        from information_schema.columns
       where table_name = 'accounts' and column_name = 'issuer'
    `);

    expect(row?.is_nullable).toBe("YES");
  });
});
