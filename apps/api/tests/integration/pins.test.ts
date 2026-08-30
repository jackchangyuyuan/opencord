import { randomUUID } from "node:crypto";

import { Permissions } from "@opencord/shared/permissions";
import { and, eq, sql } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  auditLog,
  channelRoleOverwrites,
  messages,
  serverMembers,
} from "../../src/db/schema/index.js";
import { PIN_LIMIT } from "../../src/modules/messages/pins/queries.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const idBody = z.object({ id: z.string() });
const errorBody = z.object({ error: z.object({ code: z.string() }) });

const pinnedMessage = z.object({
  id: z.string(),
  pinnedAt: z.string().nullable(),
  pinnedBy: z.string().nullable(),
});

interface Account {
  id: string;
  cookies: string[];
}

interface Fixture {
  ada: Account;
  grace: Account;
  serverId: string;
  channelId: string;
  everyoneRoleId: string;
}

async function signUp(username: string): Promise<Account> {
  const res = await request(app)
    .post("/api/auth/sign-up/email")
    .send({
      email: `${username}@example.com`,
      name: username,
      password,
      username,
    });

  expect(res.status).toBe(200);

  return {
    id: signUpBody.parse(res.body).user.id,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

async function seed(): Promise<Fixture> {
  const ada = await signUp("ada");
  const grace = await signUp("grace");

  const created = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", ada.cookies)
    .send({ name: "Analytical Engine" });

  expect(created.status).toBe(201);

  const serverId = idBody.parse(created.body).id;

  await db.insert(serverMembers).values({ serverId, userId: grace.id });

  const listed = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", ada.cookies);

  const [channel] = z.array(z.object({ id: z.string() })).parse(listed.body);

  const everyone = await db.query.roles.findFirst({
    columns: { id: true },
    where: { serverId, isDefault: true },
  });

  if (channel === undefined || everyone === undefined) {
    throw new Error("the fixture is incomplete");
  }

  return {
    ada,
    grace,
    serverId,
    channelId: channel.id,
    everyoneRoleId: everyone.id,
  };
}

async function send(
  account: Account,
  channelId: string,
  content: string,
): Promise<string> {
  const res = await request(app)
    .post(`/api/v1/channels/${channelId}/messages`)
    .set("Cookie", account.cookies)
    .send({ content, nonce: randomUUID() });

  expect(res.status).toBe(201);

  return idBody.parse(res.body).id;
}

function pin(account: Account, channelId: string, messageId: string) {
  return request(app)
    .put(`/api/v1/channels/${channelId}/messages/${messageId}/pin`)
    .set("Cookie", account.cookies);
}

function unpin(account: Account, channelId: string, messageId: string) {
  return request(app)
    .delete(`/api/v1/channels/${channelId}/messages/${messageId}/pin`)
    .set("Cookie", account.cookies);
}

async function pins(account: Account, channelId: string) {
  const res = await request(app)
    .get(`/api/v1/channels/${channelId}/pins`)
    .set("Cookie", account.cookies);

  expect(res.status).toBe(200);

  return z.array(pinnedMessage).parse(res.body);
}

async function fillPins(fixture: Fixture, count: number): Promise<string[]> {
  const rows = await db
    .insert(messages)
    .values(
      Array.from({ length: count }, (_, index) => ({
        channelId: fixture.channelId,
        authorId: fixture.ada.id,
        content: `seeded ${String(index)}`,
        pinnedAt: new Date(Date.now() - (count - index) * 1000),
        pinnedBy: fixture.ada.id,
      })),
    )
    .returning({ id: messages.id });

  return rows.map((row) => row.id);
}

describe("message pins", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("pins a message and lists it", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.grace, fixture.channelId, "keep this");

    const res = await pin(fixture.ada, fixture.channelId, messageId);

    expect(res.status).toBe(200);

    const body = pinnedMessage.parse(res.body);

    expect(body.pinnedAt).not.toBeNull();
    expect(body.pinnedBy).toBe(fixture.ada.id);

    expect(await pins(fixture.grace, fixture.channelId)).toHaveLength(1);
  });

  it("lists pins newest-pin-first", async () => {
    const fixture = await seed();

    const first = await send(fixture.ada, fixture.channelId, "one");
    const second = await send(fixture.ada, fixture.channelId, "two");

    await pin(fixture.ada, fixture.channelId, first);
    await pin(fixture.ada, fixture.channelId, second);

    expect(
      (await pins(fixture.ada, fixture.channelId)).map((row) => row.id),
    ).toEqual([second, first]);
  });

  it("pins someone else's message with the bit, and your own too", async () => {
    const fixture = await seed();

    const mine = await send(fixture.ada, fixture.channelId, "mine");
    const theirs = await send(fixture.grace, fixture.channelId, "theirs");

    expect((await pin(fixture.ada, fixture.channelId, mine)).status).toBe(200);
    expect((await pin(fixture.ada, fixture.channelId, theirs)).status).toBe(
      200,
    );
  });

  it("refuses a pin without MANAGE_MESSAGES", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.grace, fixture.channelId, "keep this");

    const res = await pin(fixture.grace, fixture.channelId, messageId);

    expect(res.status).toBe(403);
    expect(await pins(fixture.ada, fixture.channelId)).toEqual([]);
  });

  it("refuses to pin a tombstone", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "gone");

    const removed = await request(app)
      .delete(`/api/v1/channels/${fixture.channelId}/messages/${messageId}`)
      .set("Cookie", fixture.ada.cookies);

    expect(removed.status).toBe(200);

    const res = await pin(fixture.ada, fixture.channelId, messageId);

    expect(res.status).toBe(404);
    expect(errorBody.parse(res.body).error.code).toBe("MESSAGE_NOT_FOUND");
  });

  it("removes a pin from the list when it is unpinned", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "keep this");

    await pin(fixture.ada, fixture.channelId, messageId);

    const res = await unpin(fixture.ada, fixture.channelId, messageId);

    expect(res.status).toBe(200);
    expect(pinnedMessage.parse(res.body).pinnedAt).toBeNull();
    expect(await pins(fixture.ada, fixture.channelId)).toEqual([]);
  });

  it("clears the pin when the message is soft-deleted", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "keep this");

    await pin(fixture.ada, fixture.channelId, messageId);

    const removed = await request(app)
      .delete(`/api/v1/channels/${fixture.channelId}/messages/${messageId}`)
      .set("Cookie", fixture.ada.cookies);

    expect(removed.status).toBe(200);

    expect(await pins(fixture.ada, fixture.channelId)).toEqual([]);

    const [row] = await db
      .select({ pinnedAt: messages.pinnedAt, pinnedBy: messages.pinnedBy })
      .from(messages)
      .where(eq(messages.id, messageId));

    expect(row).toEqual({ pinnedAt: null, pinnedBy: null });
  });

  it("makes a half-set pin unrepresentable", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "keep this");

    const failure = await db
      .execute(
        sql`update messages set pinned_at = now() where id = ${messageId}::uuid`,
      )
      .then(
        () => null,
        (error: unknown) => error,
      );

    expect(failure).not.toBeNull();
    expect((failure as { cause?: { constraint_name?: string } }).cause).toEqual(
      expect.objectContaining({ constraint_name: "messages_pin_pair_check" }),
    );
  });

  it("audits both halves", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "keep this");

    await pin(fixture.ada, fixture.channelId, messageId);
    await unpin(fixture.ada, fixture.channelId, messageId);

    const rows = await db
      .select({ action: auditLog.action, targetId: auditLog.targetId })
      .from(auditLog)
      .where(eq(auditLog.serverId, fixture.serverId))
      .orderBy(auditLog.id);

    expect(rows).toEqual([
      { action: "message_pin", targetId: messageId },
      { action: "message_unpin", targetId: messageId },
    ]);
  });

  it("refuses a pin past the per-channel cap", async () => {
    const fixture = await seed();

    await fillPins(fixture, PIN_LIMIT);

    const overflow = await send(fixture.ada, fixture.channelId, "one too many");
    const res = await pin(fixture.ada, fixture.channelId, overflow);

    expect(res.status).toBe(409);
    expect(errorBody.parse(res.body).error.code).toBe("PIN_LIMIT_REACHED");

    expect(await pins(fixture.ada, fixture.channelId)).toHaveLength(PIN_LIMIT);
  });

  it("lets a pinned message be re-pinned at the cap", async () => {
    const fixture = await seed();

    const [first] = await fillPins(fixture, PIN_LIMIT);

    if (first === undefined) {
      throw new Error("the fixture is incomplete");
    }

    expect((await pin(fixture.ada, fixture.channelId, first)).status).toBe(200);
  });

  it("hides the pin list from a caller who cannot view the channel", async () => {
    const fixture = await seed();

    await db.insert(channelRoleOverwrites).values({
      serverId: fixture.serverId,
      channelId: fixture.channelId,
      roleId: fixture.everyoneRoleId,
      allow: 0,
      deny: Permissions.VIEW_CHANNEL,
    });

    const res = await request(app)
      .get(`/api/v1/channels/${fixture.channelId}/pins`)
      .set("Cookie", fixture.grace.cookies);

    expect(res.status).toBe(404);
  });

  it("refuses a message that is not in this channel", async () => {
    const fixture = await seed();

    const other = await request(app)
      .post(`/api/v1/servers/${fixture.serverId}/channels`)
      .set("Cookie", fixture.ada.cookies)
      .send({ type: "text", name: "other" });

    const otherChannelId = idBody.parse(other.body).id;
    const messageId = await send(fixture.ada, otherChannelId, "elsewhere");

    const res = await pin(fixture.ada, fixture.channelId, messageId);

    expect(res.status).toBe(404);
  });

  it("keeps one audit row per action even for a repeated pin", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "keep this");

    await pin(fixture.ada, fixture.channelId, messageId);
    await pin(fixture.ada, fixture.channelId, messageId);

    const rows = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.serverId, fixture.serverId),
          eq(auditLog.action, "message_pin"),
        ),
      );

    expect(rows).toHaveLength(2);
    expect(await pins(fixture.ada, fixture.channelId)).toHaveLength(1);
  });

  it("records nothing for an unpin that had nothing to undo", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "keep this");

    await pin(fixture.ada, fixture.channelId, messageId);

    expect(
      (await unpin(fixture.ada, fixture.channelId, messageId)).status,
    ).toBe(200);

    const repeated = await unpin(fixture.ada, fixture.channelId, messageId);

    expect(repeated.status).toBe(200);
    expect(repeated.body).toMatchObject({ id: messageId, pinnedAt: null });

    const rows = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.serverId, fixture.serverId),
          eq(auditLog.action, "message_unpin"),
        ),
      );

    expect(rows).toHaveLength(1);
  });

  it("keeps the cap when two pins land on the last slot together", async () => {
    const fixture = await seed();

    await fillPins(fixture, PIN_LIMIT - 1);

    const first = await send(fixture.ada, fixture.channelId, "one");
    const second = await send(fixture.ada, fixture.channelId, "two");

    const answers = await Promise.all([
      pin(fixture.ada, fixture.channelId, first),
      pin(fixture.ada, fixture.channelId, second),
    ]);

    expect(answers.filter((res) => res.status === 200)).toHaveLength(1);
    expect(answers.filter((res) => res.status === 409)).toHaveLength(1);
    expect(await pins(fixture.ada, fixture.channelId)).toHaveLength(PIN_LIMIT);
  });

  it("refuses to pin a message deleted after the check", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "doomed");

    const [pinned, deleted] = await Promise.all([
      pin(fixture.ada, fixture.channelId, messageId),
      request(app)
        .delete(`/api/v1/channels/${fixture.channelId}/messages/${messageId}`)
        .set("Cookie", fixture.ada.cookies),
    ]);

    expect(deleted.status).toBe(200);
    expect([200, 404]).toContain(pinned.status);

    const row = await db.query.messages.findFirst({
      columns: { deletedAt: true, pinnedAt: true },
      where: { id: messageId },
    });

    expect(row?.deletedAt).not.toBeNull();
    expect(row?.pinnedAt).toBeNull();
    expect(await pins(fixture.ada, fixture.channelId)).toHaveLength(0);
  });
});
