import { randomUUID } from "node:crypto";

import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { requireTestDatabase } from "../../../tests/setup.js";
import { app } from "../../app.js";
import { db } from "../../db/index.js";
import { serverMembers } from "../../db/schema/index.js";
import { loadUnreadStates } from "./read-state/unread.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const serverBody = z.object({ id: z.string() });
const channelBody = z.object({ id: z.string() });
const messageBody = z.object({ id: z.string() });

interface Account {
  id: string;
  cookies: string[];
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

interface Fixture {
  ada: Account;
  grace: Account;
  serverId: string;
  channelId: string;
  emptyChannelId: string;
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

  const [channel] = z.array(z.object({ id: z.string() })).parse(listed.body);

  const empty = await request(app)
    .post(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", ada.cookies)
    .send({ type: "text", name: "empty" });

  expect(empty.status).toBe(201);

  if (channel === undefined) {
    throw new Error("the fixture is incomplete");
  }

  return {
    ada,
    grace,
    serverId,
    channelId: channel.id,
    emptyChannelId: channelBody.parse(empty.body).id,
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

describe("loadUnreadStates", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("returns nothing for an empty channel list", async () => {
    await expect(loadUnreadStates("nobody", [])).resolves.toEqual(new Map());
  });

  it("reports a channel with messages and no read state as unread", async () => {
    const fixture = await seed();

    await send(fixture.ada, fixture.channelId, "hello");

    const states = await loadUnreadStates(fixture.grace.id, [
      fixture.channelId,
    ]);

    expect(states.get(fixture.channelId)).toEqual({
      lastReadMessageId: null,
      hasUnread: true,
      hasEveryone: false,
      mentionCount: 0,
      unreadCount: 1,
    });
  });

  it("reports an empty channel as read even with no read state", async () => {
    const fixture = await seed();

    const states = await loadUnreadStates(fixture.grace.id, [
      fixture.emptyChannelId,
    ]);

    expect(states.get(fixture.emptyChannelId)).toEqual({
      lastReadMessageId: null,
      hasUnread: false,
      hasEveryone: false,
      mentionCount: 0,
      unreadCount: 0,
    });
  });

  it("clears the dot once the watermark reaches the last message", async () => {
    const fixture = await seed();

    const messageId = await send(fixture.ada, fixture.channelId, "hello");

    expect(
      (await markRead(fixture.grace, fixture.channelId, messageId)).status,
    ).toBe(200);

    const states = await loadUnreadStates(fixture.grace.id, [
      fixture.channelId,
    ]);

    expect(states.get(fixture.channelId)?.hasUnread).toBe(false);

    await send(fixture.ada, fixture.channelId, "again");

    const after = await loadUnreadStates(fixture.grace.id, [fixture.channelId]);

    expect(after.get(fixture.channelId)?.hasUnread).toBe(true);
  });

  it("counts only this reader's unread mentions", async () => {
    const fixture = await seed();

    const first = await send(fixture.ada, fixture.channelId, "@grace one");

    await send(fixture.ada, fixture.channelId, "@grace two");

    const mine = await loadUnreadStates(fixture.grace.id, [fixture.channelId]);

    expect(mine.get(fixture.channelId)?.mentionCount).toBe(2);

    const theirs = await loadUnreadStates(fixture.ada.id, [fixture.channelId]);

    expect(theirs.get(fixture.channelId)?.mentionCount).toBe(0);

    await markRead(fixture.grace, fixture.channelId, first);

    const after = await loadUnreadStates(fixture.grace.id, [fixture.channelId]);

    expect(after.get(fixture.channelId)?.mentionCount).toBe(1);
  });

  it("flags an unread @everyone without counting it", async () => {
    const fixture = await seed();

    const before = await send(fixture.ada, fixture.channelId, "warm up");

    await markRead(fixture.grace, fixture.channelId, before);
    await send(fixture.ada, fixture.channelId, "@everyone listen");

    const states = await loadUnreadStates(fixture.grace.id, [
      fixture.channelId,
    ]);

    expect(states.get(fixture.channelId)).toEqual({
      lastReadMessageId: before,
      hasUnread: true,
      hasEveryone: true,
      mentionCount: 0,
      unreadCount: 1,
    });
  });

  it("clears @everyone once the watermark passes it", async () => {
    const fixture = await seed();

    const everyoneId = await send(
      fixture.ada,
      fixture.channelId,
      "@everyone listen",
    );

    await markRead(fixture.grace, fixture.channelId, everyoneId);

    const states = await loadUnreadStates(fixture.grace.id, [
      fixture.channelId,
    ]);

    expect(states.get(fixture.channelId)?.hasEveryone).toBe(false);
  });

  it("never reports a mention without the unread dot", async () => {
    const fixture = await seed();

    await send(fixture.ada, fixture.channelId, "@grace look");

    const states = await loadUnreadStates(fixture.grace.id, [
      fixture.channelId,
      fixture.emptyChannelId,
    ]);

    for (const state of states.values()) {
      expect(state.mentionCount > 0 && !state.hasUnread).toBe(false);
      expect(state.hasEveryone && !state.hasUnread).toBe(false);
    }
  });

  it("drops the mention count when the mentioning message is deleted", async () => {
    const fixture = await seed();

    const messageId = await send(fixture.ada, fixture.channelId, "@grace look");

    const removed = await request(app)
      .delete(`/api/v1/channels/${fixture.channelId}/messages/${messageId}`)
      .set("Cookie", fixture.ada.cookies);

    expect(removed.status).toBe(200);

    const states = await loadUnreadStates(fixture.grace.id, [
      fixture.channelId,
    ]);

    expect(states.get(fixture.channelId)?.mentionCount).toBe(0);
  });
});

describe("GET /api/v1/servers/:serverId/channels", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("carries the unread state on every listed channel", async () => {
    const fixture = await seed();

    await send(fixture.ada, fixture.channelId, "@grace look");

    const res = await request(app)
      .get(`/api/v1/servers/${fixture.serverId}/channels`)
      .set("Cookie", fixture.grace.cookies);

    expect(res.status).toBe(200);

    const listed = z
      .array(
        z.object({
          id: z.string(),
          lastReadMessageId: z.string().nullable(),
          hasUnread: z.boolean(),
          hasEveryone: z.boolean(),
          mentionCount: z.int(),
        }),
      )
      .parse(res.body);

    expect(listed.find((channel) => channel.id === fixture.channelId)).toEqual(
      expect.objectContaining({
        lastReadMessageId: null,
        hasUnread: true,
        hasEveryone: false,
        mentionCount: 1,
      }),
    );
    expect(
      listed.find((channel) => channel.id === fixture.emptyChannelId),
    ).toEqual(
      expect.objectContaining({
        hasUnread: false,
        hasEveryone: false,
        mentionCount: 0,
      }),
    );
  });
});
