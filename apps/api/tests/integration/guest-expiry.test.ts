import { randomUUID } from "node:crypto";

import { and, count, eq, isNull, lte, sql } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  auditLog,
  channelMembers,
  guestQuotas,
  readStates,
  serverMembers,
  sessions,
  users,
} from "../../src/db/schema/index.js";
import { expireGuest, runGuestExpiry } from "../../src/jobs/guest-expiry.js";
import { type Account, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const userBody = z.object({ user: z.object({ id: z.string() }) });
const idBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string() }));

async function signInAnonymously(): Promise<Account> {
  const res = await request(app).post("/api/auth/sign-in/anonymous").send({});

  expect(res.status).toBe(200);

  return {
    id: userBody.parse(res.body).user.id,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

async function createServer(account: Account, name: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", account.cookies)
    .send({ name });

  expect(res.status).toBe(201);

  return idBody.parse(res.body).id;
}

async function expire(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ guestExpiresAt: new Date(Date.now() - 1000) })
    .where(eq(users.id, userId));
}

describe("guest expiry", () => {
  beforeAll(requireTestDatabase);

  it("refuses an expired guest before the job has run", async () => {
    const guest = await signInAnonymously();

    await expire(guest.id);

    const res = await request(app)
      .get("/api/v1/users/@me")
      .set("Cookie", guest.cookies);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: "SESSION_EXPIRED" } });

    const row = await db.query.users.findFirst({
      columns: { deactivatedAt: true },
      where: { id: guest.id },
    });

    expect(row?.deactivatedAt).toBeNull();
  });

  it("clears the guest's own rows and deactivates the account", async () => {
    const guest = await signInAnonymously();
    const serverId = await createServer(guest, "Sandbox");

    const listed = await request(app)
      .get(`/api/v1/servers/${serverId}/channels`)
      .set("Cookie", guest.cookies);

    const [channel] = channelList.parse(listed.body);

    const sent = await request(app)
      .post(`/api/v1/channels/${channel?.id ?? ""}/messages`)
      .set("Cookie", guest.cookies)
      .send({ content: "hello", nonce: randomUUID() });

    await request(app)
      .put(`/api/v1/channels/${channel?.id ?? ""}/read`)
      .set("Cookie", guest.cookies)
      .send({ messageId: idBody.parse(sent.body).id });

    await expire(guest.id);

    const result = await runGuestExpiry();

    expect(result.expired).toBe(1);
    expect(result.serversDeleted).toBe(1);

    const row = await db.query.users.findFirst({
      columns: { deactivatedAt: true },
      where: { id: guest.id },
    });

    expect(row?.deactivatedAt).not.toBeNull();

    const [live] = await db
      .select({ value: count() })
      .from(sessions)
      .where(eq(sessions.userId, guest.id));
    const [memberships] = await db
      .select({ value: count() })
      .from(serverMembers)
      .where(eq(serverMembers.userId, guest.id));
    const [states] = await db
      .select({ value: count() })
      .from(readStates)
      .where(eq(readStates.userId, guest.id));
    const [quota] = await db
      .select({ value: count() })
      .from(guestQuotas)
      .where(eq(guestQuotas.userId, guest.id));

    expect(live?.value).toBe(0);
    expect(memberships?.value).toBe(0);
    expect(states?.value).toBe(0);
    expect(quota?.value).toBe(0);
  });

  it("deletes the empty server and hands the shared one to a member", async () => {
    const guest = await signInAnonymously();
    const grace = await signUp("grace");

    const empty = await createServer(guest, "Just me");
    const shared = await createServer(guest, "Not just me");

    await db.insert(serverMembers).values({
      serverId: shared,
      userId: grace.id,
    });

    await expire(guest.id);

    const result = await runGuestExpiry();

    expect(result).toMatchObject({
      expired: 1,
      serversDeleted: 1,
      serversTransferred: 1,
    });

    const gone = await db.query.servers.findFirst({ where: { id: empty } });

    expect(gone).toBeUndefined();

    const survivor = await db.query.servers.findFirst({
      columns: { ownerId: true },
      where: { id: shared },
    });

    expect(survivor?.ownerId).toBe(grace.id);

    const [transfers] = await db
      .select({ value: count() })
      .from(auditLog)
      .where(eq(auditLog.action, "server_transfer"));

    expect(transfers?.value).toBe(1);

    const [membership] = await db
      .select({ value: count() })
      .from(serverMembers)
      .where(eq(serverMembers.userId, grace.id));

    expect(membership?.value).toBe(1);
  });

  it("leaves a server the guest only joined alone", async () => {
    const guest = await signInAnonymously();
    const grace = await signUp("grace");

    const theirs = await createServer(grace, "Grace's place");

    await db.insert(serverMembers).values({
      serverId: theirs,
      userId: guest.id,
    });

    await expire(guest.id);
    await runGuestExpiry();

    const survivor = await db.query.servers.findFirst({
      columns: { ownerId: true },
      where: { id: theirs },
    });

    expect(survivor?.ownerId).toBe(grace.id);
  });

  it("keeps both sides of a direct message and its history", async () => {
    const guest = await signInAnonymously();
    const grace = await signUp("grace");

    await db.insert(serverMembers).values({
      serverId: await createServer(grace, "Shared"),
      userId: guest.id,
    });

    const opened = await request(app)
      .post("/api/v1/dms")
      .set("Cookie", guest.cookies)
      .send({ recipientId: grace.id });

    expect(opened.status).toBe(201);

    const channelId = idBody.parse(opened.body).id;

    await request(app)
      .post(`/api/v1/channels/${channelId}/messages`)
      .set("Cookie", guest.cookies)
      .send({ content: "before I go", nonce: randomUUID() });

    await expire(guest.id);
    await runGuestExpiry();

    const [participants] = await db
      .select({ value: count() })
      .from(channelMembers)
      .where(eq(channelMembers.channelId, channelId));

    expect(participants?.value).toBe(2);

    const history = await request(app)
      .get(`/api/v1/channels/${channelId}/messages`)
      .set("Cookie", grace.cookies);

    expect(history.status).toBe(200);
    expect(
      z.object({ data: z.array(z.unknown()) }).parse(history.body).data,
    ).toHaveLength(1);
  });

  it("never selects a claimed account", async () => {
    const guest = await signInAnonymously();

    const claimed = await request(app)
      .post("/api/v1/demo/claim")
      .set("Cookie", guest.cookies)
      .send({ email: "visitor@example.com", username: "visitor", password });

    expect(claimed.status).toBe(200);

    expect((await runGuestExpiry()).expired).toBe(0);

    const row = await db.query.users.findFirst({
      columns: { deactivatedAt: true },
      where: { id: guest.id },
    });

    expect(row?.deactivatedAt).toBeNull();
  });

  it("is a no-op on a second pass", async () => {
    const guest = await signInAnonymously();

    await expire(guest.id);

    expect((await runGuestExpiry()).expired).toBe(1);
    expect((await runGuestExpiry()).expired).toBe(0);
  });

  it("stops when the guest claims the account mid-pass", async () => {
    const guest = await signInAnonymously();
    const serverId = await createServer(guest, "Sandbox");

    await expire(guest.id);

    const [claimed] = await Promise.all([
      request(app)
        .post("/api/v1/demo/claim")
        .set("Cookie", guest.cookies)
        .send({ email: "visitor@example.com", username: "visitor", password }),
      runGuestExpiry(),
    ]);

    const row = await db.query.users.findFirst({
      columns: { deactivatedAt: true, isAnonymous: true },
      where: { id: guest.id },
    });

    const survived = await db.query.servers.findFirst({
      columns: { id: true },
      where: { id: serverId },
    });

    const expired = row?.deactivatedAt != null;

    expect(claimed.status).toBe(expired ? 401 : 200);
    expect(row?.isAnonymous).toBe(expired);
    expect(survived !== undefined).toBe(!expired);
  });

  it("hands the server to a member who claimed after the scan listed them", async () => {
    const guest = await signInAnonymously();
    const heir = await signInAnonymously();
    const serverId = await createServer(guest, "Not just me");

    await db.insert(serverMembers).values({ serverId, userId: heir.id });

    await expire(guest.id);

    await db
      .update(users)
      .set({ guestExpiresAt: new Date(Date.now() + 1000) })
      .where(eq(users.id, heir.id));

    const now = new Date(Date.now() + 60_000);

    const due = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.isAnonymous, true),
          isNull(users.deactivatedAt),
          lte(users.guestExpiresAt, sql`${now.toISOString()}::timestamp`),
        ),
      );

    expect(due.map((row) => row.id).sort()).toEqual([guest.id, heir.id].sort());

    const claimed = await request(app)
      .post("/api/v1/demo/claim")
      .set("Cookie", heir.cookies)
      .send({ email: "heir@example.com", username: "heir", password });

    expect(claimed.status).toBe(200);

    const outcome = await expireGuest(guest.id, now);

    expect(outcome).toMatchObject({ expired: true, deleted: 0 });
    expect(outcome.transferred).toEqual([{ serverId, nextOwnerId: heir.id }]);

    const survivor = await db.query.servers.findFirst({
      columns: { ownerId: true },
      where: { id: serverId },
    });

    expect(survivor?.ownerId).toBe(heir.id);
  });
});
