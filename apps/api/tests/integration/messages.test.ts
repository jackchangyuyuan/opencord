import { randomUUID } from "node:crypto";

import { Permissions } from "@opencord/shared/permissions";
import { and, desc, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  channelRoleOverwrites,
  messages,
  serverMembers,
} from "../../src/db/schema/index.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const serverBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string(), name: z.string() }));
const messageBody = z.object({
  id: z.string(),
  channelId: z.string(),
  authorId: z.string(),
  content: z.string(),
  nonce: z.string().nullable(),
  replyToId: z.string().nullable(),
  editedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
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

async function createServer(account: Account, name: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", account.cookies)
    .send({ name });

  expect(res.status).toBe(201);

  return serverBody.parse(res.body).id;
}

async function seed(): Promise<Fixture> {
  const ada = await signUp("ada");
  const grace = await signUp("grace");
  const serverId = await createServer(ada, "Analytical Engine");

  await db.insert(serverMembers).values({ serverId, userId: grace.id });

  const listed = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", ada.cookies);

  const [channel] = channelList.parse(listed.body);
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

function send(
  account: Account,
  channelId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(`/api/v1/channels/${channelId}/messages`)
    .set("Cookie", account.cookies)
    .send(body);
}

const messagePage = z.object({
  data: z.array(
    messageBody.extend({
      replyTo: z
        .object({
          id: z.string(),
          authorId: z.string(),
          content: z.string(),
          deletedAt: z.string().nullable(),
        })
        .nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
});

function listMessages(
  account: Account,
  channelId: string,
  query: Record<string, unknown> = {},
) {
  return request(app)
    .get(`/api/v1/channels/${channelId}/messages`)
    .query(query)
    .set("Cookie", account.cookies);
}

async function sendMany(
  account: Account,
  channelId: string,
  count: number,
): Promise<string[]> {
  const ids: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const res = await send(account, channelId, {
      content: `message ${String(index)}`,
      nonce: randomUUID(),
    });

    expect(res.status).toBe(201);
    ids.push(messageBody.parse(res.body).id);
  }

  return ids;
}

function watermark(channelId: string): Promise<string | null> {
  return db.query.channels
    .findFirst({ columns: { lastMessageId: true }, where: { id: channelId } })
    .then((channel) => channel?.lastMessageId ?? null);
}

async function liveMax(channelId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.channelId, channelId), isNull(messages.deletedAt)))
    .orderBy(desc(messages.id))
    .limit(1);

  return row?.id ?? null;
}

describe("POST /api/v1/channels/:channelId/messages", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("stores the message and advances the channel watermark", async () => {
    const fixture = await seed();

    const res = await send(fixture.grace, fixture.channelId, {
      content: "  hello  ",
      nonce: randomUUID(),
    });

    expect(res.status).toBe(201);

    const message = messageBody.parse(res.body);

    expect(message).toMatchObject({
      channelId: fixture.channelId,
      authorId: fixture.grace.id,
      content: "hello",
      replyToId: null,
      editedAt: null,
      deletedAt: null,
    });
    expect(await watermark(fixture.channelId)).toBe(message.id);
  });

  it("accepts a reply inside the same channel", async () => {
    const fixture = await seed();

    const first = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "original",
          nonce: randomUUID(),
        })
      ).body,
    );

    const res = await send(fixture.grace, fixture.channelId, {
      content: "reply",
      nonce: randomUUID(),
      replyToId: first.id,
    });

    expect(res.status).toBe(201);
    expect(messageBody.parse(res.body).replyToId).toBe(first.id);
  });

  it("refuses a reply to a message in another channel", async () => {
    const fixture = await seed();
    const other = await createServer(fixture.ada, "Difference Engine");
    const [otherChannel] = channelList.parse(
      (
        await request(app)
          .get(`/api/v1/servers/${other}/channels`)
          .set("Cookie", fixture.ada.cookies)
      ).body,
    );

    const elsewhere = messageBody.parse(
      (
        await send(fixture.ada, otherChannel?.id ?? "", {
          content: "elsewhere",
          nonce: randomUUID(),
        })
      ).body,
    );

    const res = await send(fixture.ada, fixture.channelId, {
      content: "reply",
      nonce: randomUUID(),
      replyToId: elsewhere.id,
    });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "MESSAGE_NOT_FOUND" } });
  });

  it("rejects an empty or oversized body", async () => {
    const fixture = await seed();

    expect(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "   ",
          nonce: randomUUID(),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "a".repeat(2001),
          nonce: randomUUID(),
        })
      ).status,
    ).toBe(400);
    expect(await db.select().from(messages)).toEqual([]);
  });

  it("rejects a member without SEND_MESSAGES", async () => {
    const fixture = await seed();

    await db.insert(channelRoleOverwrites).values({
      channelId: fixture.channelId,
      serverId: fixture.serverId,
      roleId: fixture.everyoneRoleId,
      deny: Permissions.SEND_MESSAGES,
    });

    const res = await send(fixture.grace, fixture.channelId, {
      content: "hello",
      nonce: randomUUID(),
    });

    expect(res.status).toBe(403);
    expect(await db.select().from(messages)).toEqual([]);
  });

  it("hides the channel entirely from a member denied VIEW_CHANNEL", async () => {
    const fixture = await seed();

    await db.insert(channelRoleOverwrites).values({
      channelId: fixture.channelId,
      serverId: fixture.serverId,
      roleId: fixture.everyoneRoleId,
      deny: Permissions.VIEW_CHANNEL,
    });

    const res = await send(fixture.grace, fixture.channelId, {
      content: "hello",
      nonce: randomUUID(),
    });

    expect(res.status).toBe(404);
  });
});

describe("nonce idempotency", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("returns 200 and the same message on a genuine retry", async () => {
    const fixture = await seed();
    const nonce = randomUUID();

    const first = await send(fixture.ada, fixture.channelId, {
      content: "hello",
      nonce,
    });

    expect(first.status).toBe(201);

    const retry = await send(fixture.ada, fixture.channelId, {
      content: "hello",
      nonce,
    });

    expect(retry.status).toBe(200);
    expect(messageBody.parse(retry.body).id).toBe(
      messageBody.parse(first.body).id,
    );
    expect(await db.select().from(messages)).toHaveLength(1);
  });

  it("returns 409 NONCE_REUSED for a different channel", async () => {
    const fixture = await seed();
    const nonce = randomUUID();
    const channelList2 = channelList.parse(
      (
        await request(app)
          .get(`/api/v1/servers/${fixture.serverId}/channels`)
          .set("Cookie", fixture.ada.cookies)
      ).body,
    );
    const second = channelList2.find(
      (channel) => channel.id !== fixture.channelId,
    );

    expect(
      (await send(fixture.ada, fixture.channelId, { content: "hello", nonce }))
        .status,
    ).toBe(201);

    const res = await send(fixture.ada, second?.id ?? "", {
      content: "hello",
      nonce,
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "NONCE_REUSED" } });
    expect(await db.select().from(messages)).toHaveLength(1);
  });

  it("returns 409 NONCE_REUSED for different content", async () => {
    const fixture = await seed();
    const nonce = randomUUID();

    await send(fixture.ada, fixture.channelId, { content: "hello", nonce });

    const res = await send(fixture.ada, fixture.channelId, {
      content: "goodbye",
      nonce,
    });

    expect(res.status).toBe(409);
  });

  it("returns 409 NONCE_REUSED for a different reply target", async () => {
    const fixture = await seed();
    const nonce = randomUUID();

    const quoted = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "original",
          nonce: randomUUID(),
        })
      ).body,
    );

    await send(fixture.ada, fixture.channelId, { content: "hello", nonce });

    const res = await send(fixture.ada, fixture.channelId, {
      content: "hello",
      nonce,
      replyToId: quoted.id,
    });

    expect(res.status).toBe(409);
  });

  it("rejects a send with no nonce", async () => {
    const fixture = await seed();

    const res = await send(fixture.ada, fixture.channelId, {
      content: "hello",
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });

  it("scopes the nonce to its author", async () => {
    const fixture = await seed();
    const nonce = randomUUID();

    expect(
      (await send(fixture.ada, fixture.channelId, { content: "hello", nonce }))
        .status,
    ).toBe(201);
    expect(
      (
        await send(fixture.grace, fixture.channelId, {
          content: "hello",
          nonce,
        })
      ).status,
    ).toBe(201);
    expect(await db.select().from(messages)).toHaveLength(2);
  });
});

describe("the watermark is monotonic under concurrency", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("ends at max(id) over live messages, round after round", async () => {
    const fixture = await seed();

    for (let round = 0; round < 5; round += 1) {
      const sends = Array.from({ length: 8 }, (_unused, index) =>
        send(fixture.ada, fixture.channelId, {
          content: `round ${String(round)} message ${String(index)}`,
          nonce: randomUUID(),
        }),
      );

      const results = await Promise.all(sends);

      for (const result of results) {
        expect(result.status).toBe(201);
      }

      expect(await watermark(fixture.channelId)).toBe(
        await liveMax(fixture.channelId),
      );
    }

    expect(await db.select().from(messages)).toHaveLength(40);
  });

  it("leaves the watermark alone on an idempotent retry", async () => {
    const fixture = await seed();
    const nonce = randomUUID();

    await send(fixture.ada, fixture.channelId, { content: "first", nonce });

    const newest = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "second",
          nonce: randomUUID(),
        })
      ).body,
    );

    expect(await watermark(fixture.channelId)).toBe(newest.id);

    const retry = await send(fixture.ada, fixture.channelId, {
      content: "first",
      nonce,
    });

    expect(retry.status).toBe(200);
    expect(await watermark(fixture.channelId)).toBe(newest.id);
  });

  it("sets the watermark from NULL on the first message", async () => {
    const fixture = await seed();

    expect(await watermark(fixture.channelId)).toBeNull();

    const first = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "first",
          nonce: randomUUID(),
        })
      ).body,
    );

    expect(await watermark(fixture.channelId)).toBe(first.id);
  });
});

describe("GET /api/v1/channels/:channelId/messages", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("returns the newest page first and pages backwards with before", async () => {
    const fixture = await seed();
    const ids = await sendMany(fixture.ada, fixture.channelId, 5);

    const first = messagePage.parse(
      (await listMessages(fixture.ada, fixture.channelId, { limit: 2 })).body,
    );

    expect(first.data.map((message) => message.id)).toEqual(
      [ids[4], ids[3]].map((id) => id ?? ""),
    );
    expect(first.nextCursor).not.toBeNull();

    const second = messagePage.parse(
      (
        await listMessages(fixture.ada, fixture.channelId, {
          limit: 2,
          before: first.nextCursor,
        })
      ).body,
    );

    expect(second.data.map((message) => message.id)).toEqual(
      [ids[2], ids[1]].map((id) => id ?? ""),
    );

    const third = messagePage.parse(
      (
        await listMessages(fixture.ada, fixture.channelId, {
          limit: 2,
          before: second.nextCursor,
        })
      ).body,
    );

    expect(third.data.map((message) => message.id)).toEqual([ids[0] ?? ""]);
    expect(third.nextCursor).toBeNull();
  });

  it("gap-fills forwards with after, oldest first", async () => {
    const fixture = await seed();
    const ids = await sendMany(fixture.ada, fixture.channelId, 5);

    const newest = messagePage.parse(
      (await listMessages(fixture.ada, fixture.channelId, { limit: 1 })).body,
    );

    const gap = messagePage.parse(
      (
        await listMessages(fixture.ada, fixture.channelId, {
          after: Buffer.from(ids[1] ?? "", "utf8").toString("base64url"),
        })
      ).body,
    );

    expect(gap.data.map((message) => message.id)).toEqual(
      [ids[2], ids[3], ids[4]].map((id) => id ?? ""),
    );
    expect(gap.nextCursor).toBeNull();
    expect(newest.data[0]?.id).toBe(ids[4]);
  });

  it("centres a window on a message with around", async () => {
    const fixture = await seed();
    const ids = await sendMany(fixture.ada, fixture.channelId, 9);

    const page = messagePage.parse(
      (
        await listMessages(fixture.ada, fixture.channelId, {
          limit: 4,
          around: Buffer.from(ids[4] ?? "", "utf8").toString("base64url"),
        })
      ).body,
    );

    expect(page.data.map((message) => message.id)).toEqual(
      [ids[3], ids[4], ids[5], ids[6]].map((id) => id ?? ""),
    );
    expect(page.nextCursor).toBeNull();
  });

  it("returns exactly the requested number of messages around an anchor", async () => {
    const fixture = await seed();
    const ids = await sendMany(fixture.ada, fixture.channelId, 9);

    const page = async (limit: number) =>
      messagePage.parse(
        (
          await listMessages(fixture.ada, fixture.channelId, {
            limit,
            around: Buffer.from(ids[4] ?? "", "utf8").toString("base64url"),
          })
        ).body,
      ).data;

    expect(await page(1)).toHaveLength(1);
    expect((await page(1))[0]?.id).toBe(ids[4]);
    expect(await page(3)).toHaveLength(3);
    expect(await page(5)).toHaveLength(5);
    expect((await page(5)).map((message) => message.id)).toEqual(
      [ids[2], ids[3], ids[4], ids[5], ids[6]].map((id) => id ?? ""),
    );
  });

  it("rejects two cursors at once", async () => {
    const fixture = await seed();
    const ids = await sendMany(fixture.ada, fixture.channelId, 2);
    const cursor = Buffer.from(ids[0] ?? "", "utf8").toString("base64url");

    const res = await listMessages(fixture.ada, fixture.channelId, {
      before: cursor,
      after: cursor,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });

  it("rejects a malformed cursor", async () => {
    const fixture = await seed();

    const res = await listMessages(fixture.ada, fixture.channelId, {
      before: "not-a-cursor",
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "INVALID_CURSOR" } });
  });

  it("rejects a limit above the cap", async () => {
    const fixture = await seed();

    expect(
      (await listMessages(fixture.ada, fixture.channelId, { limit: 101 }))
        .status,
    ).toBe(400);
  });

  it("excludes tombstoned messages through the partial index", async () => {
    const fixture = await seed();
    const ids = await sendMany(fixture.ada, fixture.channelId, 3);

    await db
      .update(messages)
      .set({ deletedAt: new Date() })
      .where(eq(messages.id, ids[1] ?? ""));

    const page = messagePage.parse(
      (await listMessages(fixture.ada, fixture.channelId)).body,
    );

    expect(page.data.map((message) => message.id)).toEqual(
      [ids[2], ids[0]].map((id) => id ?? ""),
    );
  });

  it("carries the quoted preview on both the read and the write path", async () => {
    const fixture = await seed();

    const quoted = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "original",
          nonce: randomUUID(),
        })
      ).body,
    );

    const posted = await send(fixture.grace, fixture.channelId, {
      content: "reply",
      nonce: randomUUID(),
      replyToId: quoted.id,
    });

    expect(posted.body).toMatchObject({
      replyTo: { id: quoted.id, authorId: fixture.ada.id, content: "original" },
    });

    const page = messagePage.parse(
      (await listMessages(fixture.grace, fixture.channelId)).body,
    );

    expect(page.data[0]?.replyTo).toMatchObject({
      id: quoted.id,
      content: "original",
      deletedAt: null,
    });
    expect(page.data[1]?.replyTo).toBeNull();
  });

  it("hides the channel from a caller who cannot view it", async () => {
    const fixture = await seed();

    await db.insert(channelRoleOverwrites).values({
      channelId: fixture.channelId,
      serverId: fixture.serverId,
      roleId: fixture.everyoneRoleId,
      deny: Permissions.VIEW_CHANNEL,
    });

    expect((await listMessages(fixture.grace, fixture.channelId)).status).toBe(
      404,
    );
  });
});
