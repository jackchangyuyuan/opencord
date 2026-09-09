import { RESERVED_USERNAME_PREFIXES } from "@opencord/shared/constants";
import { usernameSchema } from "@opencord/shared/schemas";
import type { GenericEndpointContext } from "better-auth";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { auth } from "../../src/auth.js";
import { db } from "../../src/db/index.js";
import { accounts, users } from "../../src/db/schema/index.js";
import { TEST_PASSWORD } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

function createOAuthUser(email: string, name: string) {
  return auth.$context.then((context) =>
    context.internalAdapter.createUser(
      { email, name, emailVerified: true },
      { method: "oauth" },
    ),
  );
}

function usernameOf(user: unknown): string {
  return (user as { username: string }).username;
}

describe("signing in with a social provider", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("reports which providers this deployment is configured for", async () => {
    const res = await request(app).get("/api/v1/auth/providers");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ social: expect.any(Array) as unknown });
    expect(res.get("Set-Cookie")).toBeUndefined();
  });

  it("derives a usable handle from the provider's email", async () => {
    const created: unknown = await createOAuthUser(
      "ada.lovelace@example.com",
      "Ada",
    );

    expect(usernameOf(created)).toBe("ada.lovelace");
    expect(usernameSchema.safeParse(usernameOf(created)).success).toBe(true);
  });

  it("never stores the address, only its local part", async () => {
    const created: unknown = await createOAuthUser(
      "grace@example.com",
      "Grace",
    );

    expect(usernameOf(created)).toBe("grace");
    expect(usernameOf(created)).not.toContain("@");
    expect(usernameOf(created)).not.toContain("example.com");
  });

  it("does not hand an OAuth account a guest-shaped handle", async () => {
    const created: unknown = await createOAuthUser(
      "guest-person@example.com",
      "Guest",
    );

    for (const prefix of RESERVED_USERNAME_PREFIXES) {
      expect(usernameOf(created).startsWith(prefix)).toBe(false);
    }

    expect(usernameSchema.safeParse(usernameOf(created)).success).toBe(true);
  });

  it("separates two people whose addresses agree before the @", async () => {
    const first: unknown = await createOAuthUser(
      "linus@one.example",
      "Linus One",
    );
    const second: unknown = await createOAuthUser(
      "linus@two.example",
      "Linus Two",
    );

    expect(usernameOf(first)).toBe("linus");
    expect(usernameOf(second)).not.toBe(usernameOf(first));
    expect(usernameOf(second)).toMatch(/^linus-[0-9a-f]{8}$/);
  });

  it("falls back to a valid handle when the address has nothing usable in it", async () => {
    const created: unknown = await createOAuthUser("--@example.com", "Someone");

    expect(usernameSchema.safeParse(usernameOf(created)).success).toBe(true);
  });

  it("keeps implicit account linking behind a verified local address", async () => {
    const { account } = (await auth.$context).options;
    const linking = account.accountLinking;

    expect(linking.enabled).toBe(true);
    expect(linking).not.toHaveProperty("requireLocalEmailVerified", false);
    expect(linking).not.toHaveProperty("disableImplicitLinking", true);
  });
});

describe("a provider identity meeting an account that took its address first", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  async function arrive(email: string, accountId: string) {
    const context = (await auth.$context) as unknown as GenericEndpointContext;

    return handleOAuthUserInfo({ context } as GenericEndpointContext, {
      userInfo: {
        id: accountId,
        email,
        emailVerified: true,
        name: "The owner of the address",
      },
      account: {
        providerId: "google",
        issuer: "https://accounts.google.com",
        accountId,
      },
      callbackURL: "/",
    });
  }

  async function registerWithPassword(email: string, username: string) {
    const res = await request(app)
      .post("/api/auth/sign-up/email")
      .send({ email, name: username, password: TEST_PASSWORD, username });

    expect(res.status).toBe(200);

    return z.object({ user: z.object({ id: z.string() }) }).parse(res.body).user
      .id;
  }

  it("refuses to link, and hands the provider identity no session", async () => {
    const taken = await registerWithPassword("owner@example.com", "impostor");

    expect(
      (
        await db.query.users.findFirst({
          columns: { emailVerified: true },
          where: { id: taken },
        })
      )?.emailVerified,
    ).toBe(false);

    const arrival = await arrive("owner@example.com", "google-owner-1");

    expect(arrival.error).toBe("account not linked");
    expect(arrival.data).toBe(null);

    const linked = await db
      .select({ providerId: accounts.providerId })
      .from(accounts)
      .where(eq(accounts.userId, taken));

    expect(linked.map((row) => row.providerId)).toEqual(["credential"]);
  });

  it("links once the local address has been verified", async () => {
    const owner = await registerWithPassword("proven@example.com", "proven");

    await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, owner));

    const arrival = await arrive("proven@example.com", "google-proven-1");

    expect(arrival.error).toBe(null);
    expect(arrival.data?.user.id).toBe(owner);

    const linked = await db
      .select({ providerId: accounts.providerId })
      .from(accounts)
      .where(eq(accounts.userId, owner));

    expect(linked.map((row) => row.providerId).sort()).toEqual([
      "credential",
      "google",
    ]);
  });
});
