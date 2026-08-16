import { sql } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { requireTestDatabase } from "../setup.js";

const email = "ada@example.com";
const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });

function signUp() {
  return request(app)
    .post("/api/auth/sign-up/email")
    .send({ email, name: "Ada", password });
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
    expect(res.body).toMatchObject({ user: { email, name: "Ada" } });

    const stored = await db.query.users.findFirst({
      columns: { email: true, emailVerified: true },
      with: { accounts: { columns: { issuer: true, providerId: true } } },
    });

    expect(stored).toEqual({
      email,
      emailVerified: false,
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
      user: { email },
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
