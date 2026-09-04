import { count, eq, sql } from "drizzle-orm";
import request from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { resolveAccessibleChannels } from "../../src/access/channels.js";
import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { channels, dmPairs, users } from "../../src/db/schema/index.js";
import * as dmQueries from "../../src/modules/dms/queries.js";
import { openDm } from "../../src/modules/dms/service.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const channelBody = z.object({
  id: z.string(),
  serverId: z.null(),
  type: z.literal("dm"),
});
const dmList = z.array(
  z.object({
    id: z.string(),
    recipient: z.object({ id: z.string(), username: z.string() }),
    hasUnread: z.boolean(),
  }),
);
const messageBody = z.object({ id: z.string(), content: z.string() });
const serverBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string() }));
const participants = z.array(
  z.object({ id: z.string(), username: z.string(), name: z.string() }),
);

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

function openDmRequest(account: Account, recipientId: string) {
  return request(app)
    .post("/api/v1/dms")
    .set("Cookie", account.cookies)
    .send({ recipientId });
}

describe("direct messages", () => {
  beforeAll(requireTestDatabase);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records the pair in byte order for IDs whose orderings disagree", async () => {
    const lower = "Bq7xK2";
    const upper = "aQ9zL1";

    const [collation] = await db.execute<{ datcollate: string }>(
      sql`select datcollate from pg_database where datname = current_database()`,
    );

    expect(collation?.datcollate).not.toBe("C");

    await db.insert(users).values([
      {
        id: lower,
        name: "Bq",
        email: "bq@example.com",
        username: "bq",
      },
      {
        id: upper,
        name: "aQ",
        email: "aq@example.com",
        username: "aq",
      },
    ]);

    const opened = await openDm({ id: upper }, lower);

    expect(opened.created).toBe(true);

    const [pair] = await db
      .select({ userA: dmPairs.userA, userB: dmPairs.userB })
      .from(dmPairs);

    expect(pair).toEqual({ userA: lower, userB: upper });
  });

  it("resolves concurrent creations to one channel and leaves no orphan", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    const [first, second] = await Promise.all([
      openDmRequest(ada, grace.id),
      openDmRequest(grace, ada.id),
    ]);

    expect([first.status, second.status].toSorted()).toEqual([200, 201]);

    const channelId = channelBody.parse(first.body).id;

    expect(channelBody.parse(second.body).id).toBe(channelId);

    const [pairs] = await db.select({ value: count() }).from(dmPairs);
    const [dmChannels] = await db
      .select({ value: count() })
      .from(channels)
      .where(eq(channels.type, "dm"));

    expect(pairs?.value).toBe(1);
    expect(dmChannels?.value).toBe(1);
  });

  it("rolls back and reuses the channel when the pair is claimed mid-flight", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    const created = await openDmRequest(ada, grace.id);

    expect(created.status).toBe(201);

    // The lookup misses exactly once, so the insert meets the row another
    // request already claimed -- the race the retry loop exists for.
    vi.spyOn(dmQueries, "findDmChannelId").mockResolvedValueOnce(undefined);

    const raced = await openDmRequest(grace, ada.id);

    expect(raced.status).toBe(200);
    expect(channelBody.parse(raced.body).id).toBe(
      channelBody.parse(created.body).id,
    );

    const [pairs] = await db.select({ value: count() }).from(dmPairs);
    const [dmChannels] = await db
      .select({ value: count() })
      .from(channels)
      .where(eq(channels.type, "dm"));

    expect(pairs?.value).toBe(1);
    expect(dmChannels?.value).toBe(1);
  });

  it("returns the same channel for the reversed pair", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    const created = await openDmRequest(ada, grace.id);

    expect(created.status).toBe(201);

    const reversed = await openDmRequest(grace, ada.id);

    expect(reversed.status).toBe(200);
    expect(channelBody.parse(reversed.body).id).toBe(
      channelBody.parse(created.body).id,
    );
  });

  it("refuses a direct message with yourself", async () => {
    const ada = await signUp("ada");

    const res = await openDmRequest(ada, ada.id);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "CANNOT_DM_SELF" } });
  });

  it("refuses a direct message with a user who does not exist", async () => {
    const ada = await signUp("ada");

    const res = await openDmRequest(ada, "nobody");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "USER_NOT_FOUND" } });
  });

  it("lists a direct message with its counterpart", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    await openDmRequest(ada, grace.id);

    const listed = await request(app)
      .get("/api/v1/dms")
      .set("Cookie", ada.cookies);

    expect(listed.status).toBe(200);
    expect(dmList.parse(listed.body)).toHaveLength(1);
    expect(dmList.parse(listed.body)[0]?.recipient.username).toBe("grace");
  });

  it("lists nothing for somebody with no conversations", async () => {
    const ada = await signUp("ada");

    const listed = await request(app)
      .get("/api/v1/dms")
      .set("Cookie", ada.cookies);

    expect(listed.status).toBe(200);
    expect(dmList.parse(listed.body)).toEqual([]);
  });

  it("carries the whole chat surface into a direct message", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    const opened = await openDmRequest(ada, grace.id);
    const channelId = channelBody.parse(opened.body).id;

    const sent = await request(app)
      .post(`/api/v1/channels/${channelId}/messages`)
      .set("Cookie", ada.cookies)
      .send({ content: "@everyone hello", nonce: crypto.randomUUID() });

    expect(sent.status).toBe(201);
    expect(messageBody.parse(sent.body).content).toBe("@everyone hello");

    const messageId = messageBody.parse(sent.body).id;

    const reacted = await request(app)
      .put(
        `/api/v1/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent("👍")}`,
      )
      .set("Cookie", grace.cookies);

    expect(reacted.status).toBe(204);

    const pinned = await request(app)
      .put(`/api/v1/channels/${channelId}/messages/${messageId}/pin`)
      .set("Cookie", grace.cookies);

    expect(pinned.status).toBe(200);

    const read = await request(app)
      .put(`/api/v1/channels/${channelId}/read`)
      .set("Cookie", grace.cookies)
      .send({ messageId });

    expect(read.status).toBe(200);

    const accessible = await resolveAccessibleChannels(grace.id);

    expect(accessible.has(channelId)).toBe(true);
  });

  it("refuses to let a participant delete the other's message", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    const opened = await openDmRequest(ada, grace.id);
    const channelId = channelBody.parse(opened.body).id;

    const sent = await request(app)
      .post(`/api/v1/channels/${channelId}/messages`)
      .set("Cookie", ada.cookies)
      .send({ content: "mine", nonce: crypto.randomUUID() });

    const res = await request(app)
      .delete(
        `/api/v1/channels/${channelId}/messages/${messageBody.parse(sent.body).id}`,
      )
      .set("Cookie", grace.cookies);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "NOT_THE_AUTHOR" } });
  });

  it("hides a direct message from everybody who is not in it", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const alan = await signUp("alan");

    const opened = await openDmRequest(ada, grace.id);
    const channelId = channelBody.parse(opened.body).id;

    const res = await request(app)
      .get(`/api/v1/channels/${channelId}/messages`)
      .set("Cookie", alan.cookies);

    expect(res.status).toBe(404);
  });

  it("lists both participants of a direct message", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    const opened = await openDmRequest(ada, grace.id);
    const channelId = channelBody.parse(opened.body).id;

    const res = await request(app)
      .get(`/api/v1/channels/${channelId}/members`)
      .set("Cookie", grace.cookies);

    expect(res.status).toBe(200);
    expect(participants.parse(res.body).map((row) => row.username)).toEqual([
      "ada",
      "grace",
    ]);
  });

  it("hides the participant list from everybody who is not in it", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const alan = await signUp("alan");

    const opened = await openDmRequest(ada, grace.id);
    const channelId = channelBody.parse(opened.body).id;

    const res = await request(app)
      .get(`/api/v1/channels/${channelId}/members`)
      .set("Cookie", alan.cookies);

    expect(res.status).toBe(404);
  });

  it("refuses to answer for a server channel", async () => {
    const ada = await signUp("ada");

    const server = await request(app)
      .post("/api/v1/servers")
      .set("Cookie", ada.cookies)
      .send({ name: "Rosetta" });

    expect(server.status).toBe(201);

    const listed = await request(app)
      .get(`/api/v1/servers/${serverBody.parse(server.body).id}/channels`)
      .set("Cookie", ada.cookies);

    const channelId = channelList.parse(listed.body)[0]?.id ?? "";

    const res = await request(app)
      .get(`/api/v1/channels/${channelId}/members`)
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "NOT_A_DM_CHANNEL" } });
  });

  it("has no overwrites to attach", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    const opened = await openDmRequest(ada, grace.id);
    const channelId = channelBody.parse(opened.body).id;

    const res = await request(app)
      .get(`/api/v1/channels/${channelId}/overwrites`)
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(404);
  });
});
