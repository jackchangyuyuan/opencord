import { randomUUID } from "node:crypto";

import { Permissions } from "@opencord/shared/permissions";
import { eq, sql } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  channelRoleOverwrites,
  reactions,
  serverMembers,
} from "../../src/db/schema/index.js";
import { type Account, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

const idBody = z.object({ id: z.string() });
const errorBody = z.object({ error: z.object({ code: z.string() }) });

const reactionList = z.array(
  z.object({ emoji: z.string(), count: z.int(), me: z.boolean() }),
);

const messagePage = z.object({
  data: z.array(z.object({ id: z.string(), reactions: reactionList })),
});

interface Fixture {
  ada: Account;
  grace: Account;
  serverId: string;
  channelId: string;
  everyoneRoleId: string;
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

function react(
  account: Account,
  channelId: string,
  messageId: string,
  emoji: string,
) {
  return request(app)
    .put(
      `/api/v1/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    )
    .set("Cookie", account.cookies);
}

function unreact(
  account: Account,
  channelId: string,
  messageId: string,
  emoji: string,
) {
  return request(app)
    .delete(
      `/api/v1/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    )
    .set("Cookie", account.cookies);
}

async function listReactions(account: Account, channelId: string) {
  const res = await request(app)
    .get(`/api/v1/channels/${channelId}/messages`)
    .set("Cookie", account.cookies);

  expect(res.status).toBe(200);

  return messagePage.parse(res.body).data;
}

describe("reactions", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("records a reaction and serializes the grouped count", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    expect(
      (await react(fixture.grace, fixture.channelId, messageId, "👍")).status,
    ).toBe(204);

    const [message] = await listReactions(fixture.grace, fixture.channelId);

    expect(message?.reactions).toEqual([{ emoji: "👍", count: 1, me: true }]);

    const [asAda] = await listReactions(fixture.ada, fixture.channelId);

    expect(asAda?.reactions).toEqual([{ emoji: "👍", count: 1, me: false }]);
  });

  it("counts one row per user and emoji", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    await react(fixture.ada, fixture.channelId, messageId, "🎉");
    await react(fixture.grace, fixture.channelId, messageId, "🎉");
    await react(fixture.grace, fixture.channelId, messageId, "👍");

    const [message] = await listReactions(fixture.grace, fixture.channelId);

    expect(message?.reactions).toEqual([
      { emoji: "👍", count: 1, me: true },
      { emoji: "🎉", count: 2, me: true },
    ]);
  });

  it("is idempotent: reacting twice succeeds and leaves one row", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    expect(
      (await react(fixture.grace, fixture.channelId, messageId, "🔥")).status,
    ).toBe(204);
    expect(
      (await react(fixture.grace, fixture.channelId, messageId, "🔥")).status,
    ).toBe(204);

    const rows = await db
      .select()
      .from(reactions)
      .where(eq(reactions.messageId, messageId));

    expect(rows).toHaveLength(1);
  });

  it("removes only the caller's reaction", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    await react(fixture.ada, fixture.channelId, messageId, "👍");
    await react(fixture.grace, fixture.channelId, messageId, "👍");

    expect(
      (await unreact(fixture.grace, fixture.channelId, messageId, "👍")).status,
    ).toBe(204);

    const [message] = await listReactions(fixture.grace, fixture.channelId);

    expect(message?.reactions).toEqual([{ emoji: "👍", count: 1, me: false }]);
  });

  it("treats removing a reaction that is not there as a no-op", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    expect(
      (await unreact(fixture.grace, fixture.channelId, messageId, "👍")).status,
    ).toBe(204);
  });

  it("refuses an emoji outside the curated set and writes no row", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    const res = await react(fixture.grace, fixture.channelId, messageId, "🦕");

    expect(res.status).toBe(400);
    expect(errorBody.parse(res.body).error.code).toBe("INVALID_EMOJI");

    const rows = await db
      .select()
      .from(reactions)
      .where(eq(reactions.messageId, messageId));

    expect(rows).toEqual([]);
  });

  it("refuses an arbitrary string as an emoji", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    const res = await react(
      fixture.grace,
      fixture.channelId,
      messageId,
      "not-an-emoji",
    );

    expect(res.status).toBe(400);
    expect(errorBody.parse(res.body).error.code).toBe("INVALID_EMOJI");
  });

  it("answers 400, not 500, for a percent-encoded percent sign", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    const res = await request(app)
      .put(
        `/api/v1/channels/${fixture.channelId}/messages/${messageId}/reactions/%25`,
      )
      .set("Cookie", fixture.grace.cookies);

    expect(res.status).toBe(400);
    expect(errorBody.parse(res.body).error.code).toBe("INVALID_EMOJI");

    const removed = await request(app)
      .delete(
        `/api/v1/channels/${fixture.channelId}/messages/${messageId}/reactions/%25`,
      )
      .set("Cookie", fixture.grace.cookies);

    expect(removed.status).toBe(400);
  });

  it("requires ADD_REACTIONS", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    await db.insert(channelRoleOverwrites).values({
      serverId: fixture.serverId,
      channelId: fixture.channelId,
      roleId: fixture.everyoneRoleId,
      allow: 0,
      deny: Permissions.ADD_REACTIONS,
    });

    const res = await react(fixture.grace, fixture.channelId, messageId, "👍");

    expect(res.status).toBe(403);
  });

  it("refuses a message that does not exist", async () => {
    const fixture = await seed();

    const res = await react(
      fixture.grace,
      fixture.channelId,
      randomUUID(),
      "👍",
    );

    expect(res.status).toBe(404);
    expect(errorBody.parse(res.body).error.code).toBe("MESSAGE_NOT_FOUND");
  });

  it("refuses a soft-deleted message", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    const removed = await request(app)
      .delete(`/api/v1/channels/${fixture.channelId}/messages/${messageId}`)
      .set("Cookie", fixture.ada.cookies);

    expect(removed.status).toBe(200);

    const res = await react(fixture.grace, fixture.channelId, messageId, "👍");

    expect(res.status).toBe(404);
  });

  it("drops the rows when the message is hard-deleted", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    await react(fixture.grace, fixture.channelId, messageId, "👍");

    await db.execute(sql`delete from messages where id = ${messageId}::uuid`);

    const rows = await db
      .select()
      .from(reactions)
      .where(eq(reactions.messageId, messageId));

    expect(rows).toEqual([]);
  });
});
