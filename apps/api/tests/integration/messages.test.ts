import { randomUUID } from "node:crypto";

import { Permissions } from "@opencord/shared/permissions";
import { and, desc, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  attachments,
  auditLog,
  channelRoleOverwrites,
  memberRoles,
  mentions,
  messages,
  roles,
  serverMembers,
} from "../../src/db/schema/index.js";
import * as storage from "../../src/lib/storage.js";
import { type Account, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

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

interface Fixture {
  ada: Account;
  grace: Account;
  serverId: string;
  channelId: string;
  everyoneRoleId: string;
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

function editMessage(
  account: Account,
  channelId: string,
  messageId: string,
  content: string,
) {
  return request(app)
    .patch(`/api/v1/channels/${channelId}/messages/${messageId}`)
    .set("Cookie", account.cookies)
    .send({ content });
}

function removeMessage(account: Account, channelId: string, messageId: string) {
  return request(app)
    .delete(`/api/v1/channels/${channelId}/messages/${messageId}`)
    .set("Cookie", account.cookies);
}

function watermark(channelId: string): Promise<string | null> {
  return db.query.channels
    .findFirst({ columns: { lastMessageId: true }, where: { id: channelId } })
    .then((channel) => channel?.lastMessageId ?? null);
}

function everyoneWatermark(channelId: string): Promise<string | null> {
  return db.query.channels
    .findFirst({
      columns: { lastEveryoneMentionId: true },
      where: { id: channelId },
    })
    .then((channel) => channel?.lastEveryoneMentionId ?? null);
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

  it("charges no second allowance and re-prepares no attachment", async () => {
    const fixture = await seed();
    const nonce = randomUUID();
    const objectKey = `attachments/${fixture.ada.id}/${randomUUID()}.png`;

    const head = vi.spyOn(storage, "headObject").mockResolvedValue({
      contentType: "image/png",
      size: 2048,
      lastModified: new Date(),
    });

    const body = {
      content: "with a file",
      nonce,
      attachments: [{ objectKey, filename: "diagram.png" }],
    };

    expect((await send(fixture.ada, fixture.channelId, body)).status).toBe(201);

    const preparedOnce = head.mock.calls.length;

    const retry = await send(fixture.ada, fixture.channelId, body);

    expect(retry.status).toBe(200);
    expect(head.mock.calls.length).toBe(preparedOnce);
    expect(await db.select().from(messages)).toHaveLength(1);
    expect(await db.select().from(attachments)).toHaveLength(1);

    vi.restoreAllMocks();
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

  it("replays a reply whose quoted message was deleted after the first send", async () => {
    const fixture = await seed();

    const quoted = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "the original",
          nonce: randomUUID(),
        })
      ).body,
    );

    const nonce = randomUUID();
    const first = await send(fixture.ada, fixture.channelId, {
      content: "quoting you",
      nonce,
      replyToId: quoted.id,
    });

    expect(first.status).toBe(201);

    expect(
      (await removeMessage(fixture.ada, fixture.channelId, quoted.id)).status,
    ).toBe(200);

    const retry = await send(fixture.ada, fixture.channelId, {
      content: "quoting you",
      nonce,
      replyToId: quoted.id,
    });

    expect(retry.status).toBe(200);
    expect(messageBody.parse(retry.body).id).toBe(
      messageBody.parse(first.body).id,
    );
  });

  it("still refuses a first reply to a message that is not live", async () => {
    const fixture = await seed();

    const quoted = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "the original",
          nonce: randomUUID(),
        })
      ).body,
    );

    await removeMessage(fixture.ada, fixture.channelId, quoted.id);

    const res = await send(fixture.ada, fixture.channelId, {
      content: "quoting a tombstone",
      nonce: randomUUID(),
      replyToId: quoted.id,
    });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: { code: "MESSAGE_NOT_FOUND" },
    });
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

describe("editing and soft-deleting messages", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("lets the author edit and stamps editedAt", async () => {
    const fixture = await seed();
    const [id] = await sendMany(fixture.grace, fixture.channelId, 1);

    const res = await editMessage(
      fixture.grace,
      fixture.channelId,
      id ?? "",
      "  corrected  ",
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ content: "corrected" });
    expect(messageBody.parse(res.body).editedAt).not.toBeNull();
  });

  it("refuses an edit of a message deleted after the check", async () => {
    const fixture = await seed();
    const [id] = await sendMany(fixture.ada, fixture.channelId, 1);

    const [edited, removed] = await Promise.all([
      editMessage(fixture.ada, fixture.channelId, id ?? "", "@grace look"),
      removeMessage(fixture.ada, fixture.channelId, id ?? ""),
    ]);

    expect(removed.status).toBe(200);
    expect([200, 404]).toContain(edited.status);

    const row = await db.query.messages.findFirst({
      columns: { deletedAt: true },
      where: { id: id ?? "" },
    });

    expect(row?.deletedAt).not.toBeNull();

    expect(
      await db
        .select()
        .from(mentions)
        .where(eq(mentions.messageId, id ?? "")),
    ).toEqual([]);
  });

  it("refuses an edit of someone else's message", async () => {
    const fixture = await seed();
    const [id] = await sendMany(fixture.grace, fixture.channelId, 1);

    const res = await editMessage(
      fixture.ada,
      fixture.channelId,
      id ?? "",
      "not mine",
    );

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "NOT_THE_AUTHOR" } });
  });

  it("refuses an edit of a tombstone", async () => {
    const fixture = await seed();
    const [id] = await sendMany(fixture.grace, fixture.channelId, 1);

    expect(
      (await removeMessage(fixture.grace, fixture.channelId, id ?? "")).status,
    ).toBe(200);

    const res = await editMessage(
      fixture.grace,
      fixture.channelId,
      id ?? "",
      "resurrected",
    );

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "MESSAGE_NOT_FOUND" } });
  });

  it("writes no audit row when the author deletes their own message", async () => {
    const fixture = await seed();
    const [id] = await sendMany(fixture.grace, fixture.channelId, 1);

    const res = await removeMessage(fixture.grace, fixture.channelId, id ?? "");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      channelId: fixture.channelId,
      messageId: id,
    });
    expect(await db.select().from(auditLog)).toEqual([]);

    const stored = await db.query.messages.findFirst({ where: { id } });

    expect(stored?.deletedAt).not.toBeNull();
  });

  it("audits a moderator delete as message_delete", async () => {
    const fixture = await seed();
    const [id] = await sendMany(fixture.grace, fixture.channelId, 1);

    expect(
      (await removeMessage(fixture.ada, fixture.channelId, id ?? "")).status,
    ).toBe(200);

    const entries = await db.select().from(auditLog);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: fixture.ada.id,
      action: "message_delete",
      targetType: "message",
      targetId: id,
      metadata: { channelId: fixture.channelId, authorId: fixture.grace.id },
    });
  });

  it("refuses a delete by someone without MANAGE_MESSAGES", async () => {
    const fixture = await seed();
    const hopper = await signUp("hopper");

    await db
      .insert(serverMembers)
      .values({ serverId: fixture.serverId, userId: hopper.id });

    const [id] = await sendMany(fixture.grace, fixture.channelId, 1);

    const res = await removeMessage(hopper, fixture.channelId, id ?? "");

    expect(res.status).toBe(403);

    const stored = await db.query.messages.findFirst({ where: { id } });

    expect(stored?.deletedAt).toBeNull();
  });

  it("refuses a moderator delete of the owner's message", async () => {
    const fixture = await seed();

    await db
      .update(roles)
      .set({
        permissions:
          Permissions.VIEW_CHANNEL |
          Permissions.SEND_MESSAGES |
          Permissions.MANAGE_MESSAGES,
      })
      .where(eq(roles.id, fixture.everyoneRoleId));

    const [id] = await sendMany(fixture.ada, fixture.channelId, 1);

    const res = await removeMessage(fixture.grace, fixture.channelId, id ?? "");

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "TARGET_IS_OWNER" } });
  });

  it("refuses a moderator delete of a peer's message", async () => {
    const fixture = await seed();
    const hopper = await signUp("hopper");

    await db
      .insert(serverMembers)
      .values({ serverId: fixture.serverId, userId: hopper.id });

    const [role] = await db
      .insert(roles)
      .values({
        serverId: fixture.serverId,
        name: "moderator",
        permissions:
          Permissions.VIEW_CHANNEL |
          Permissions.SEND_MESSAGES |
          Permissions.MANAGE_MESSAGES,
        position: 3,
      })
      .returning({ id: roles.id });

    for (const account of [fixture.grace, hopper]) {
      await db.insert(memberRoles).values({
        serverId: fixture.serverId,
        userId: account.id,
        roleId: role?.id ?? "",
      });
    }

    const [id] = await sendMany(hopper, fixture.channelId, 1);

    expect(
      (await removeMessage(fixture.grace, fixture.channelId, id ?? "")).status,
    ).toBe(403);
  });

  it("repairs the watermark to the newest live message", async () => {
    const fixture = await seed();
    const ids = await sendMany(fixture.ada, fixture.channelId, 3);

    expect(await watermark(fixture.channelId)).toBe(ids[2]);

    await removeMessage(fixture.ada, fixture.channelId, ids[2] ?? "");

    expect(await watermark(fixture.channelId)).toBe(ids[1]);

    await removeMessage(fixture.ada, fixture.channelId, ids[0] ?? "");

    expect(await watermark(fixture.channelId)).toBe(ids[1]);

    await removeMessage(fixture.ada, fixture.channelId, ids[1] ?? "");

    expect(await watermark(fixture.channelId)).toBeNull();
  });

  it("leaves the watermark alone when the deleted message was not the tail", async () => {
    const fixture = await seed();
    const ids = await sendMany(fixture.ada, fixture.channelId, 2);

    await removeMessage(fixture.ada, fixture.channelId, ids[0] ?? "");

    expect(await watermark(fixture.channelId)).toBe(ids[1]);
  });
});

describe("mentions are parsed, stored and repaired", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("rewrites a user mention and writes one row", async () => {
    const fixture = await seed();

    const res = await send(fixture.ada, fixture.channelId, {
      content: "hi @grace",
      nonce: randomUUID(),
    });

    expect(res.status).toBe(201);
    expect(messageBody.parse(res.body).content).toBe(
      `hi <@${fixture.grace.id}>`,
    );

    const rows = await db.select().from(mentions);

    expect(rows).toEqual([
      {
        userId: fixture.grace.id,
        messageId: messageBody.parse(res.body).id,
        channelId: fixture.channelId,
      },
    ]);
  });

  it("writes no row for a self-mention", async () => {
    const fixture = await seed();

    await send(fixture.ada, fixture.channelId, {
      content: "note to @ada",
      nonce: randomUUID(),
    });

    expect(await db.select().from(mentions)).toEqual([]);
  });

  it("leaves an unresolvable marker literal", async () => {
    const fixture = await seed();

    const res = await send(fixture.ada, fixture.channelId, {
      content: "hi @nobody and #nowhere",
      nonce: randomUUID(),
    });

    expect(messageBody.parse(res.body).content).toBe("hi @nobody and #nowhere");
    expect(await db.select().from(mentions)).toEqual([]);
  });

  it("rewrites role and channel mentions without writing rows", async () => {
    const fixture = await seed();

    const [role] = await db
      .insert(roles)
      .values({ serverId: fixture.serverId, name: "staff", position: 1 })
      .returning({ id: roles.id });

    const res = await send(fixture.ada, fixture.channelId, {
      content: "@staff see #general",
      nonce: randomUUID(),
    });

    expect(messageBody.parse(res.body).content).toBe(
      `<@&${role?.id ?? ""}> see <#${fixture.channelId}>`,
    );
    expect(await db.select().from(mentions)).toEqual([]);
  });

  it("does not resolve a user who is not a member of the server", async () => {
    const fixture = await seed();

    await signUp("hopper");

    const res = await send(fixture.ada, fixture.channelId, {
      content: "hi @hopper",
      nonce: randomUUID(),
    });

    expect(messageBody.parse(res.body).content).toBe("hi @hopper");
  });
});

describe("the @everyone watermark", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("advances only when the author holds MENTION_EVERYONE", async () => {
    const fixture = await seed();

    const denied = await send(fixture.grace, fixture.channelId, {
      content: "@everyone listen",
      nonce: randomUUID(),
    });

    expect(denied.status).toBe(201);
    expect(await everyoneWatermark(fixture.channelId)).toBeNull();
    expect(await db.select().from(mentions)).toEqual([]);

    const allowed = await send(fixture.ada, fixture.channelId, {
      content: "@everyone listen",
      nonce: randomUUID(),
    });

    expect(await everyoneWatermark(fixture.channelId)).toBe(
      messageBody.parse(allowed.body).id,
    );
  });

  it("leaves the channel watermark alone for @here", async () => {
    const fixture = await seed();

    const here = await send(fixture.ada, fixture.channelId, {
      content: "@here quick one",
      nonce: randomUUID(),
    });

    expect(here.status).toBe(201);
    expect(await everyoneWatermark(fixture.channelId)).toBeNull();

    const row = await db.query.messages.findFirst({
      columns: { mentionsEveryone: true },
      where: { id: messageBody.parse(here.body).id },
    });

    expect(row?.mentionsEveryone).toBe(false);
  });

  it("clears the badge when the pointing message is deleted", async () => {
    const fixture = await seed();

    const broadcast = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "@everyone listen",
          nonce: randomUUID(),
        })
      ).body,
    );

    expect(await everyoneWatermark(fixture.channelId)).toBe(broadcast.id);

    await removeMessage(fixture.ada, fixture.channelId, broadcast.id);

    expect(await everyoneWatermark(fixture.channelId)).toBeNull();
  });

  it("clears the badge when the mention is edited away", async () => {
    const fixture = await seed();

    const broadcast = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "@everyone listen",
          nonce: randomUUID(),
        })
      ).body,
    );

    await editMessage(
      fixture.ada,
      fixture.channelId,
      broadcast.id,
      "never mind",
    );

    expect(await everyoneWatermark(fixture.channelId)).toBeNull();
  });

  it("advances when an edit adds the mention", async () => {
    const fixture = await seed();

    const plain = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "just a message",
          nonce: randomUUID(),
        })
      ).body,
    );

    expect(await everyoneWatermark(fixture.channelId)).toBeNull();

    await editMessage(
      fixture.ada,
      fixture.channelId,
      plain.id,
      "@everyone actually",
    );

    expect(await everyoneWatermark(fixture.channelId)).toBe(plain.id);
  });

  it("does not clobber a newer broadcast when an older one is deleted", async () => {
    const fixture = await seed();

    const older = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "@everyone first",
          nonce: randomUUID(),
        })
      ).body,
    );
    const newer = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "@everyone second",
          nonce: randomUUID(),
        })
      ).body,
    );

    expect(await everyoneWatermark(fixture.channelId)).toBe(newer.id);

    await removeMessage(fixture.ada, fixture.channelId, older.id);

    expect(await everyoneWatermark(fixture.channelId)).toBe(newer.id);
  });

  it("never falls back to a broadcast its author was not allowed to send", async () => {
    const fixture = await seed();

    const authorized = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "@everyone standup",
          nonce: randomUUID(),
        })
      ).body,
    );

    const denied = messageBody.parse(
      (
        await send(fixture.grace, fixture.channelId, {
          content: "@everyone read this",
          nonce: randomUUID(),
        })
      ).body,
    );

    expect(await everyoneWatermark(fixture.channelId)).toBe(authorized.id);

    await removeMessage(fixture.ada, fixture.channelId, authorized.id);

    expect(await everyoneWatermark(fixture.channelId)).toBeNull();

    const [row] = await db
      .select({ mentionsEveryone: messages.mentionsEveryone })
      .from(messages)
      .where(eq(messages.id, denied.id));

    expect(row?.mentionsEveryone).toBe(false);
  });

  it("never falls back to an email-like string that only looks like a broadcast", async () => {
    const fixture = await seed();

    const authorized = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "@everyone standup",
          nonce: randomUUID(),
        })
      ).body,
    );

    expect(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "mail me at bob@here.com",
          nonce: randomUUID(),
        })
      ).status,
    ).toBe(201);

    await removeMessage(fixture.ada, fixture.channelId, authorized.id);

    expect(await everyoneWatermark(fixture.channelId)).toBeNull();
  });

  it("falls back to the newest surviving broadcast", async () => {
    const fixture = await seed();

    const older = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "@everyone first",
          nonce: randomUUID(),
        })
      ).body,
    );
    const newer = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "@everyone second",
          nonce: randomUUID(),
        })
      ).body,
    );

    await removeMessage(fixture.ada, fixture.channelId, newer.id);

    expect(await everyoneWatermark(fixture.channelId)).toBe(older.id);
  });
});

describe("mention rows follow the message", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("disappear on a soft delete", async () => {
    const fixture = await seed();

    const posted = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "hi @grace",
          nonce: randomUUID(),
        })
      ).body,
    );

    expect(await db.select().from(mentions)).toHaveLength(1);

    await removeMessage(fixture.ada, fixture.channelId, posted.id);

    expect(await db.select().from(mentions)).toEqual([]);
  });

  it("disappear when the mention is edited away", async () => {
    const fixture = await seed();

    const posted = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "hi @grace",
          nonce: randomUUID(),
        })
      ).body,
    );

    expect(await db.select().from(mentions)).toHaveLength(1);

    await editMessage(fixture.ada, fixture.channelId, posted.id, "never mind");

    expect(await db.select().from(mentions)).toEqual([]);
  });

  it("are rewritten when an edit changes who is mentioned", async () => {
    const fixture = await seed();
    const hopper = await signUp("hopper");

    await db
      .insert(serverMembers)
      .values({ serverId: fixture.serverId, userId: hopper.id });

    const posted = messageBody.parse(
      (
        await send(fixture.ada, fixture.channelId, {
          content: "hi @grace",
          nonce: randomUUID(),
        })
      ).body,
    );

    await editMessage(fixture.ada, fixture.channelId, posted.id, "hi @hopper");

    expect(await db.select().from(mentions)).toEqual([
      {
        userId: hopper.id,
        messageId: posted.id,
        channelId: fixture.channelId,
      },
    ]);
  });
});
