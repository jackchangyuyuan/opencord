import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { readStates, serverMembers } from "../../src/db/schema/index.js";
import { type Account, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

const serverBody = z.object({ id: z.string() });
const channelBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string() }));
const messageBody = z.object({ id: z.string() });
const readBody = z.object({
  channelId: z.string(),
  lastReadMessageId: z.string(),
  mentionCount: z.int(),
});
const errorBody = z.object({ error: z.object({ code: z.string() }) });

interface Fixture {
  ada: Account;
  grace: Account;
  serverId: string;
  channelId: string;
  otherChannelId: string;
}

async function seed(): Promise<Fixture> {
  const ada = await signUp("ada");
  const grace = await signUp("grace");

  const created = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", ada.cookies)
    .send({ name: "Analytical Engine" });

  expect(created.status).toBe(201);

  const serverId = serverBody.parse(created.body).id;

  await db.insert(serverMembers).values({ serverId, userId: grace.id });

  const listed = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", ada.cookies);

  const [channel] = channelList.parse(listed.body);

  const second = await request(app)
    .post(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", ada.cookies)
    .send({ type: "text", name: "second" });

  expect(second.status).toBe(201);

  if (channel === undefined) {
    throw new Error("the fixture is incomplete");
  }

  return {
    ada,
    grace,
    serverId,
    channelId: channel.id,
    otherChannelId: channelBody.parse(second.body).id,
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

  return messageBody.parse(res.body).id;
}

function markRead(account: Account, channelId: string, messageId: string) {
  return request(app)
    .put(`/api/v1/channels/${channelId}/read`)
    .set("Cookie", account.cookies)
    .send({ messageId });
}

function storedWatermark(
  userId: string,
  channelId: string,
): Promise<string | null> {
  return db
    .select({ id: readStates.lastReadMessageId })
    .from(readStates)
    .where(
      and(eq(readStates.userId, userId), eq(readStates.channelId, channelId)),
    )
    .then((rows) => rows[0]?.id ?? null);
}

async function futureUuid(): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`select uuidv7('1 year'::interval) as id`,
  );

  const id = rows[0]?.id;

  if (id === undefined) {
    throw new Error("PostgreSQL did not mint a future UUIDv7");
  }

  return id;
}

const unreadList = z.array(
  z.object({ id: z.string(), hasUnread: z.boolean() }),
);

async function listChannels(
  account: Account,
  serverId: string,
): Promise<Map<string, boolean>> {
  const res = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", account.cookies);

  expect(res.status).toBe(200);

  return new Map(
    unreadList
      .parse(res.body)
      .map((channel) => [channel.id, channel.hasUnread]),
  );
}

describe("PUT /api/v1/channels/:channelId/read", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("records the watermark the client names", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    const res = await markRead(fixture.grace, fixture.channelId, messageId);

    expect(res.status).toBe(200);
    expect(readBody.parse(res.body)).toEqual({
      channelId: fixture.channelId,
      lastReadMessageId: messageId,
      mentionCount: 0,
    });

    await expect(
      storedWatermark(fixture.grace.id, fixture.channelId),
    ).resolves.toBe(messageId);
  });

  it("keeps one row per user and channel", async () => {
    const fixture = await seed();

    const first = await send(fixture.ada, fixture.channelId, "one");
    const second = await send(fixture.ada, fixture.channelId, "two");

    expect(
      (await markRead(fixture.grace, fixture.channelId, first)).status,
    ).toBe(200);
    expect(
      (await markRead(fixture.grace, fixture.channelId, second)).status,
    ).toBe(200);

    const rows = await db
      .select({ id: readStates.lastReadMessageId })
      .from(readStates)
      .where(eq(readStates.userId, fixture.grace.id));

    expect(rows).toEqual([{ id: second }]);
  });

  it("holds separate watermarks for separate readers", async () => {
    const fixture = await seed();

    const first = await send(fixture.ada, fixture.channelId, "one");
    const second = await send(fixture.ada, fixture.channelId, "two");

    await markRead(fixture.ada, fixture.channelId, second);
    await markRead(fixture.grace, fixture.channelId, first);

    await expect(
      storedWatermark(fixture.ada.id, fixture.channelId),
    ).resolves.toBe(second);
    await expect(
      storedWatermark(fixture.grace.id, fixture.channelId),
    ).resolves.toBe(first);
  });

  it("refuses a message that belongs to another channel", async () => {
    const fixture = await seed();
    const elsewhere = await send(
      fixture.ada,
      fixture.otherChannelId,
      "over here",
    );

    const res = await markRead(fixture.grace, fixture.channelId, elsewhere);

    expect(res.status).toBe(404);
    expect(errorBody.parse(res.body).error.code).toBe("MESSAGE_NOT_FOUND");
    await expect(
      storedWatermark(fixture.grace.id, fixture.channelId),
    ).resolves.toBeNull();
  });

  it("refuses a fabricated future UUIDv7", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    expect(
      (await markRead(fixture.grace, fixture.channelId, messageId)).status,
    ).toBe(200);

    const res = await markRead(
      fixture.grace,
      fixture.channelId,
      await futureUuid(),
    );

    expect(res.status).toBe(404);
    expect(errorBody.parse(res.body).error.code).toBe("MESSAGE_NOT_FOUND");
    await expect(
      storedWatermark(fixture.grace.id, fixture.channelId),
    ).resolves.toBe(messageId);
  });

  it("refuses a message that does not exist", async () => {
    const fixture = await seed();

    const res = await markRead(fixture.grace, fixture.channelId, randomUUID());

    expect(res.status).toBe(404);
    expect(errorBody.parse(res.body).error.code).toBe("MESSAGE_NOT_FOUND");
  });

  it("refuses a message in a channel the caller cannot see", async () => {
    const fixture = await seed();
    const outsider = await signUp("hopper");
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    const res = await markRead(outsider, fixture.channelId, messageId);

    expect(res.status).toBe(403);
    await expect(
      storedWatermark(outsider.id, fixture.channelId),
    ).resolves.toBeNull();
  });

  it("never moves the watermark backwards", async () => {
    const fixture = await seed();

    const x = await send(fixture.ada, fixture.channelId, "x");
    const y = await send(fixture.ada, fixture.channelId, "y");

    expect((await markRead(fixture.grace, fixture.channelId, y)).status).toBe(
      200,
    );

    const replay = await markRead(fixture.grace, fixture.channelId, x);

    expect(replay.status).toBe(200);
    expect(readBody.parse(replay.body).lastReadMessageId).toBe(y);
    await expect(
      storedWatermark(fixture.grace.id, fixture.channelId),
    ).resolves.toBe(y);
  });

  it("leaves a mention that arrives after the watermark unread", async () => {
    const fixture = await seed();

    const x = await send(fixture.ada, fixture.channelId, "x");
    const y = await send(fixture.ada, fixture.channelId, "y");

    await markRead(fixture.grace, fixture.channelId, y);

    const mention = await send(fixture.ada, fixture.channelId, "@grace look");

    await markRead(fixture.grace, fixture.channelId, x);

    const watermark = await storedWatermark(
      fixture.grace.id,
      fixture.channelId,
    );

    expect(watermark).toBe(y);
    expect(watermark === null || watermark < mention).toBe(true);
  });

  it("refuses a message that was soft-deleted", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    const removed = await request(app)
      .delete(`/api/v1/channels/${fixture.channelId}/messages/${messageId}`)
      .set("Cookie", fixture.ada.cookies);

    expect(removed.status).toBe(200);

    const res = await markRead(fixture.grace, fixture.channelId, messageId);

    expect(res.status).toBe(404);
  });

  it("clears the unread dot the channel list reports", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    const before = await listChannels(fixture.grace, fixture.serverId);

    expect(before.get(fixture.channelId)).toBe(true);

    expect(
      (await markRead(fixture.grace, fixture.channelId, messageId)).status,
    ).toBe(200);

    const after = await listChannels(fixture.grace, fixture.serverId);

    expect(after.get(fixture.channelId)).toBe(false);
  });

  it("does not report your own message as unread", async () => {
    const fixture = await seed();

    await send(fixture.ada, fixture.channelId, "mine");

    const list = await listChannels(fixture.ada, fixture.serverId);

    expect(list.get(fixture.channelId)).toBe(false);
  });

  it("stops reporting unread once the only new message is deleted", async () => {
    const fixture = await seed();
    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    expect(
      (await listChannels(fixture.grace, fixture.serverId)).get(
        fixture.channelId,
      ),
    ).toBe(true);

    expect(
      (
        await request(app)
          .delete(`/api/v1/channels/${fixture.channelId}/messages/${messageId}`)
          .set("Cookie", fixture.ada.cookies)
      ).status,
    ).toBe(200);

    expect(
      (await listChannels(fixture.grace, fixture.serverId)).get(
        fixture.channelId,
      ),
    ).toBe(false);
  });

  it("reports the mentions still unread after the watermark moves", async () => {
    const fixture = await seed();

    const first = await send(fixture.ada, fixture.channelId, "@grace one");

    await send(fixture.ada, fixture.channelId, "@grace two");

    const res = await markRead(fixture.grace, fixture.channelId, first);

    expect(res.status).toBe(200);
    expect(readBody.parse(res.body).mentionCount).toBe(1);
  });

  it("rejects a body that is not a UUID", async () => {
    const fixture = await seed();

    const res = await markRead(fixture.grace, fixture.channelId, "not-a-uuid");

    expect(res.status).toBe(400);
  });
});
