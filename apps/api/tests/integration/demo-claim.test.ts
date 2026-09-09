import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { count, eq, sql } from "drizzle-orm";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  accounts,
  auditLog,
  guestQuotas,
  invites,
  messages,
  servers,
} from "../../src/db/schema/index.js";
import { seedCommunity } from "../../src/db/seed/community.js";
import { seedSandboxTemplate } from "../../src/db/seed/sandbox.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const scenarioBody = z.object({ userId: z.string(), sandboxId: z.string() });
const claimedBody = z.object({
  id: z.string(),
  email: z.string(),
  username: z.string(),
});
const idBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string() }));

interface Account {
  id: string;
  cookies: string[];
}

async function seedWorld(): Promise<void> {
  const community = await seedCommunity(200);

  await seedSandboxTemplate(community.people);
}

async function enterDemo(): Promise<{ account: Account; sandboxId: string }> {
  const res = await request(app).post("/api/v1/demo/guest").send({});

  expect(res.status).toBe(201);

  const scenario = scenarioBody.parse(res.body);

  return {
    account: { id: scenario.userId, cookies: res.get("Set-Cookie") ?? [] },
    sandboxId: scenario.sandboxId,
  };
}

function claim(account: Account, body: Record<string, unknown>) {
  return request(app)
    .post("/api/v1/demo/claim")
    .set("Cookie", account.cookies)
    .send(body);
}

const details = {
  email: "visitor@example.com",
  username: "visitor",
  password,
};

describe("claiming a guest account", () => {
  beforeAll(requireTestDatabase);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the user id and everything hanging off it", async () => {
    await seedWorld();

    const { account: guest, sandboxId } = await enterDemo();

    const listed = await request(app)
      .get(`/api/v1/servers/${sandboxId}/channels`)
      .set("Cookie", guest.cookies);

    const [channel] = channelList.parse(listed.body);
    const channelId = channel?.id ?? "";

    const sent = await request(app)
      .post(`/api/v1/channels/${channelId}/messages`)
      .set("Cookie", guest.cookies)
      .send({ content: "mine", nonce: randomUUID() });

    expect(sent.status).toBe(201);

    const messageId = idBody.parse(sent.body).id;

    expect(
      (
        await request(app)
          .put(
            `/api/v1/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent("👍")}`,
          )
          .set("Cookie", guest.cookies)
      ).status,
    ).toBe(204);

    expect(
      (
        await request(app)
          .put(`/api/v1/channels/${channelId}/messages/${messageId}/pin`)
          .set("Cookie", guest.cookies)
      ).status,
    ).toBe(200);

    const invited = await request(app)
      .post(`/api/v1/servers/${sandboxId}/invites`)
      .set("Cookie", guest.cookies)
      .send({});

    expect(invited.status).toBe(201);

    const [peer] = await db.execute<{ id: string }>(sql`
      select u.id from users u
       where u.username like 'seed-%'
         and not exists (
           select 1 from channel_members cm where cm.user_id = u.id
         )
       order by u.id
       limit 1
    `);

    expect(
      (
        await request(app)
          .post("/api/v1/dms")
          .set("Cookie", guest.cookies)
          .send({ recipientId: peer?.id ?? "" })
      ).status,
    ).toBe(201);

    const authoredBefore = await db
      .select({ value: count() })
      .from(messages)
      .where(eq(messages.authorId, guest.id));

    expect(authoredBefore[0]?.value).toBeGreaterThan(1);

    const claimed = await claim(guest, details);

    expect(claimed.status).toBe(200);
    expect(claimedBody.parse(claimed.body).id).toBe(guest.id);

    const row = await db.query.users.findFirst({
      columns: {
        isAnonymous: true,
        guestExpiresAt: true,
        emailVerified: true,
        email: true,
        username: true,
      },
      where: { id: guest.id },
    });

    expect(row).toEqual({
      isAnonymous: false,
      guestExpiresAt: null,
      emailVerified: false,
      email: details.email,
      username: details.username,
    });

    const quota = await db
      .select({ value: count() })
      .from(guestQuotas)
      .where(eq(guestQuotas.userId, guest.id));

    expect(quota[0]?.value).toBe(0);

    const owned = await db
      .select({ value: count() })
      .from(servers)
      .where(eq(servers.ownerId, guest.id));
    const authored = await db
      .select({ value: count() })
      .from(messages)
      .where(eq(messages.authorId, guest.id));
    const audited = await db
      .select({ value: count() })
      .from(auditLog)
      .where(eq(auditLog.actorId, guest.id));
    const invitesMade = await db
      .select({ value: count() })
      .from(invites)
      .where(eq(invites.inviterId, guest.id));

    expect(owned[0]?.value).toBe(1);
    expect(authored[0]?.value).toBe(authoredBefore[0]?.value);
    expect(audited[0]?.value).toBeGreaterThan(0);
    expect(invitesMade[0]?.value).toBe(1);

    const me = await request(app)
      .get("/api/v1/users/@me")
      .set("Cookie", guest.cookies);

    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ id: guest.id });

    await request(app)
      .post("/api/auth/sign-out")
      .set("Cookie", guest.cookies)
      .send({});

    const back = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: details.email, password });

    expect(back.status).toBe(200);
    expect(
      z.object({ user: z.object({ id: z.string() }) }).parse(back.body).user.id,
    ).toBe(guest.id);
  });

  it("stays retryable when the identity write fails", async () => {
    await seedWorld();

    const { account: guest } = await enterDemo();

    const transaction = vi
      .spyOn(db, "transaction")
      .mockRejectedValueOnce(new Error("the identity write failed"));

    const failed = await claim(guest, details);

    expect(failed.status).toBe(500);
    transaction.mockRestore();

    const midway = await db.query.users.findFirst({
      columns: { isAnonymous: true, guestExpiresAt: true, email: true },
      where: { id: guest.id },
    });

    expect(midway?.isAnonymous).toBe(true);
    expect(midway?.guestExpiresAt).not.toBeNull();
    expect(midway?.email).not.toBe(details.email);

    const retried = await claim(guest, details);

    expect(retried.status).toBe(200);

    const credentials = await db
      .select({ value: count() })
      .from(accounts)
      .where(eq(accounts.userId, guest.id));

    expect(credentials[0]?.value).toBe(1);
  });

  it("honours the password of the request that succeeds", async () => {
    await seedWorld();

    const { account: guest } = await enterDemo();

    const transaction = vi
      .spyOn(db, "transaction")
      .mockRejectedValueOnce(new Error("the identity write failed"));

    expect(
      (await claim(guest, { ...details, password: "first attempt password" }))
        .status,
    ).toBe(500);

    transaction.mockRestore();

    const second = "second attempt password";

    expect((await claim(guest, { ...details, password: second })).status).toBe(
      200,
    );

    const signedIn = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: details.email, password: second });

    expect(signedIn.status).toBe(200);

    const stale = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: details.email, password: "first attempt password" });

    expect(stale.status).toBeGreaterThanOrEqual(400);
  });

  it("leaves the losing request's password nowhere near the account", async () => {
    await seedWorld();

    const { account: guest } = await enterDemo();

    const winner = "the password that was accepted";
    const loser = "the password that was refused";

    const answers = await Promise.all([
      claim(guest, { ...details, password: winner }),
      claim(guest, {
        ...details,
        email: "second@example.com",
        username: "second",
        password: loser,
      }),
    ]);

    const accepted = answers.filter((res) => res.status === 200);

    expect(accepted).toHaveLength(1);

    const claimed = await db.query.users.findFirst({
      columns: { email: true, isAnonymous: true },
      where: { id: guest.id },
    });

    expect(claimed?.isAnonymous).toBe(false);

    const email = claimed?.email ?? "";
    const survived = email === details.email ? winner : loser;
    const rejected = survived === winner ? loser : winner;

    expect(
      (
        await request(app)
          .post("/api/auth/sign-in/email")
          .send({ email, password: survived })
      ).status,
    ).toBe(200);

    expect(
      (
        await request(app)
          .post("/api/auth/sign-in/email")
          .send({ email, password: rejected })
      ).status,
    ).toBeGreaterThanOrEqual(400);
  });

  it("refuses a session that is not a guest", async () => {
    await request(app).post("/api/auth/sign-up/email").send({
      email: "ada@example.com",
      name: "ada",
      password,
      username: "ada",
    });

    const created = await request(app)
      .post("/api/auth/sign-in/email")
      .send({ email: "ada@example.com", password });

    const res = await claim(
      { id: "", cookies: created.get("Set-Cookie") ?? [] },
      { ...details, email: "other@example.com", username: "other" },
    );

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "NOT_A_GUEST" } });
  });

  it("reports a taken email or username and leaves the guest usable", async () => {
    await seedWorld();

    await request(app).post("/api/auth/sign-up/email").send({
      email: "taken@example.com",
      name: "taken",
      password,
      username: "taken",
    });

    const { account: guest } = await enterDemo();

    const byEmail = await claim(guest, {
      ...details,
      email: "taken@example.com",
    });

    expect(byEmail.status).toBe(409);
    expect(byEmail.body).toMatchObject({ error: { code: "EMAIL_TAKEN" } });

    const byUsername = await claim(guest, { ...details, username: "taken" });

    expect(byUsername.status).toBe(409);
    expect(byUsername.body).toMatchObject({
      error: { code: "USERNAME_TAKEN" },
    });

    const still = await db.query.users.findFirst({
      columns: { isAnonymous: true },
      where: { id: guest.id },
    });

    expect(still?.isAnonymous).toBe(true);
    expect((await claim(guest, details)).status).toBe(200);
  });

  it("refuses a guest-shaped username", async () => {
    await seedWorld();

    const { account: guest } = await enterDemo();

    const res = await claim(guest, {
      ...details,
      username: "guest-deadbeefdeadbeef",
    });

    expect(res.status).toBe(400);
  });

  it("clears the flags in exactly one write site", () => {
    const offenders: string[] = [];

    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);

        if (entry.isDirectory()) {
          walk(path);
          continue;
        }

        if (
          entry.name.endsWith(".ts") &&
          /isAnonymous:\s*false/.test(readFileSync(path, "utf8"))
        ) {
          offenders.push(path);
        }
      }
    };

    walk("src");

    expect(offenders).toEqual([join("src", "modules", "demo", "service.ts")]);
  });
});
