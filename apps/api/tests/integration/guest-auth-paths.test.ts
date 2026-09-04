import { GUEST_BLOCKED_AUTH_PATHS } from "@opencord/shared/constants";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { auth } from "../../src/auth.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const userBody = z.object({ user: z.object({ id: z.string() }) });

interface Account {
  id: string;
  cookies: string[];
}

async function signInAnonymously(): Promise<Account> {
  const res = await request(app).post("/api/auth/sign-in/anonymous").send({});

  expect(res.status).toBe(200);

  return {
    id: userBody.parse(res.body).user.id,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

describe("the guest deny-list on Better Auth's own router", () => {
  beforeAll(requireTestDatabase);

  it("has exactly one entry, and it is not /set-password", () => {
    expect([...GUEST_BLOCKED_AUTH_PATHS]).toEqual(["/link-social"]);
    expect([...GUEST_BLOCKED_AUTH_PATHS]).not.toContain("/set-password");
  });

  it("refuses every listed path for an anonymous session", async () => {
    const guest = await signInAnonymously();

    for (const path of GUEST_BLOCKED_AUTH_PATHS) {
      const res = await request(app)
        .post(`/api/auth${path}`)
        .set("Cookie", guest.cookies)
        .send({ provider: "github", callbackURL: "/app" });

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: "GUEST_USE_CLAIM" });
    }
  });

  it("leaves the session's load-bearing paths open to a guest", async () => {
    const guest = await signInAnonymously();

    const session = await request(app)
      .get("/api/auth/get-session")
      .set("Cookie", guest.cookies);

    expect(session.status).toBe(200);

    const overHttp = await request(app)
      .post("/api/auth/set-password")
      .set("Cookie", guest.cookies)
      .send({ newPassword: password });

    expect(overHttp.status).toBe(404);

    await expect(
      auth.api.setPassword({
        headers: new Headers({ cookie: guest.cookies.join("; ") }),
        body: { newPassword: password },
      }),
    ).resolves.toMatchObject({ status: true });

    const signUp = await request(app)
      .post("/api/auth/sign-up/email")
      .set("Cookie", guest.cookies)
      .send({
        email: "separate@example.com",
        name: "separate",
        password,
        username: "separate",
      });

    expect(signUp.status).toBe(200);

    const signOut = await request(app)
      .post("/api/auth/sign-out")
      .set("Cookie", guest.cookies)
      .send({});

    expect(signOut.status).toBe(200);
  });

  it("lets an existing account sign in while a guest session is held", async () => {
    await request(app).post("/api/auth/sign-up/email").send({
      email: "ada@example.com",
      name: "ada",
      password,
      username: "ada",
    });

    const guest = await signInAnonymously();

    const signIn = await request(app)
      .post("/api/auth/sign-in/email")
      .set("Cookie", guest.cookies)
      .send({ email: "ada@example.com", password });

    expect(signIn.status).toBe(200);
  });

  it("leaves the same paths open to a registered session", async () => {
    const created = await request(app).post("/api/auth/sign-up/email").send({
      email: "grace@example.com",
      name: "grace",
      password,
      username: "grace",
    });

    const cookies = created.get("Set-Cookie") ?? [];

    for (const path of GUEST_BLOCKED_AUTH_PATHS) {
      const res = await request(app)
        .post(`/api/auth${path}`)
        .set("Cookie", cookies)
        .send({ provider: "github", callbackURL: "/app" });

      expect(res.body).not.toMatchObject({ code: "GUEST_USE_CLAIM" });
    }
  });
});
