import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  attachments,
  messages,
  serverMembers,
} from "../../src/db/schema/index.js";
import * as storage from "../../src/lib/storage.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const serverBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string() }));
const messageBody = z.object({
  id: z.string(),
  content: z.string(),
  attachments: z.array(
    z.object({
      objectKey: z.string(),
      filename: z.string(),
      contentType: z.string(),
      size: z.number(),
      width: z.number().nullable(),
      height: z.number().nullable(),
    }),
  ),
});

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
  channelId: string;
}

async function seed(): Promise<Fixture> {
  const ada = await signUp("ada");
  const grace = await signUp("grace");

  const created = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", ada.cookies)
    .send({ name: "Analytical Engine" });

  const serverId = serverBody.parse(created.body).id;

  await db.insert(serverMembers).values({ serverId, userId: grace.id });

  const listed = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", ada.cookies);

  const [channel] = channelList.parse(listed.body);

  if (channel === undefined) {
    throw new Error("the fixture is incomplete");
  }

  return { ada, grace, channelId: channel.id };
}

function keyFor(userId: string): string {
  return `attachments/${userId}/${randomUUID()}.png`;
}

function stubStorage(size = 2048, contentType = "image/png") {
  vi.spyOn(storage, "headObject").mockResolvedValue({
    contentType,
    size,
    lastModified: new Date(),
  });

  return vi.spyOn(storage, "deleteObject").mockResolvedValue();
}

function send(account: Account, channelId: string, body: unknown) {
  return request(app)
    .post(`/api/v1/channels/${channelId}/messages`)
    .set("Cookie", account.cookies)
    .send(body as Record<string, unknown>);
}

function edit(
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

describe("message attachments", () => {
  beforeAll(requireTestDatabase);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("records the stored size and type, never the client's", async () => {
    const { ada, channelId } = await seed();

    stubStorage(4096, "image/webp");

    const res = await send(ada, channelId, {
      content: "",
      nonce: randomUUID(),
      attachments: [
        { objectKey: keyFor(ada.id), filename: "diagram.png", width: 800 },
      ],
    });

    expect(res.status).toBe(201);

    const [file] = messageBody.parse(res.body).attachments;

    expect(file).toMatchObject({
      contentType: "image/webp",
      size: 4096,
      filename: "diagram.png",
      width: 800,
      height: null,
    });
  });

  it("refuses another user's key and writes nothing", async () => {
    const { ada, grace, channelId } = await seed();

    stubStorage();

    const res = await send(grace, channelId, {
      content: "mine now",
      nonce: randomUUID(),
      attachments: [{ objectKey: keyFor(ada.id), filename: "stolen.png" }],
    });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: { code: "UPLOAD_KEY_FORBIDDEN" },
    });

    const [rows] = await db.select({ value: count() }).from(attachments);
    const [written] = await db.select({ value: count() }).from(messages);

    expect(rows?.value).toBe(0);
    expect(written?.value).toBe(0);
  });

  it("does not delete the object it refused to associate", async () => {
    const { ada, grace, channelId } = await seed();

    const deleted = stubStorage();

    await send(grace, channelId, {
      content: "mine now",
      nonce: randomUUID(),
      attachments: [{ objectKey: keyFor(ada.id), filename: "stolen.png" }],
    });

    expect(deleted).not.toHaveBeenCalled();
  });

  it("rejects a key with no object behind it", async () => {
    const { ada, channelId } = await seed();

    vi.spyOn(storage, "headObject").mockResolvedValue(null);

    const res = await send(ada, channelId, {
      content: "look",
      nonce: randomUUID(),
      attachments: [{ objectKey: keyFor(ada.id), filename: "ghost.png" }],
    });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "UPLOAD_NOT_FOUND" } });
  });

  it("deletes and rejects an object left past the association window", async () => {
    const { ada, channelId } = await seed();

    vi.spyOn(storage, "headObject").mockResolvedValue({
      contentType: "image/png",
      size: 2048,
      lastModified: new Date(Date.now() - 3_600_000),
    });

    const deleted = vi.spyOn(storage, "deleteObject").mockResolvedValue();

    const res = await send(ada, channelId, {
      content: "late",
      nonce: randomUUID(),
      attachments: [{ objectKey: keyFor(ada.id), filename: "late.png" }],
    });

    expect(res.status).toBe(400);
    expect(deleted).toHaveBeenCalledTimes(1);
  });

  it("requires a filename and writes no partial row", async () => {
    const { ada, channelId } = await seed();

    stubStorage();

    const res = await send(ada, channelId, {
      content: "look",
      nonce: randomUUID(),
      attachments: [{ objectKey: keyFor(ada.id) }],
    });

    expect(res.status).toBe(400);

    const [written] = await db.select({ value: count() }).from(messages);

    expect(written?.value).toBe(0);
  });

  it("stores an out-of-range dimension as NULL rather than rejecting it", async () => {
    const { ada, channelId } = await seed();

    stubStorage();

    const res = await send(ada, channelId, {
      content: "hints",
      nonce: randomUUID(),
      attachments: [
        {
          objectKey: keyFor(ada.id),
          filename: "hint.png",
          width: 0,
          height: 999_999,
        },
      ],
    });

    expect(res.status).toBe(201);

    const [file] = messageBody.parse(res.body).attachments;

    expect(file).toMatchObject({ width: null, height: null });
  });

  it("caps a message at four attachments", async () => {
    const { ada, channelId } = await seed();

    stubStorage();

    const five = Array.from({ length: 5 }, () => ({
      objectKey: keyFor(ada.id),
      filename: "many.png",
    }));

    const res = await send(ada, channelId, {
      content: "too many",
      nonce: randomUUID(),
      attachments: five,
    });

    expect(res.status).toBe(400);
  });

  it("allows empty content only when a file comes with it", async () => {
    const { ada, channelId } = await seed();

    stubStorage();

    expect(
      (await send(ada, channelId, { content: "   ", nonce: randomUUID() }))
        .status,
    ).toBe(400);

    const withFile = await send(ada, channelId, {
      content: "",
      nonce: randomUUID(),
      attachments: [{ objectKey: keyFor(ada.id), filename: "solo.png" }],
    });

    expect(withFile.status).toBe(201);
    expect(messageBody.parse(withFile.body).content).toBe("");
  });

  it("cascades attachment rows when the message row goes", async () => {
    const { ada, channelId } = await seed();

    stubStorage();

    const sent = await send(ada, channelId, {
      content: "bye",
      nonce: randomUUID(),
      attachments: [{ objectKey: keyFor(ada.id), filename: "bye.png" }],
    });

    const messageId = messageBody.parse(sent.body).id;

    await db.delete(messages).where(eq(messages.id, messageId));

    const [rows] = await db.select({ value: count() }).from(attachments);

    expect(rows?.value).toBe(0);
  });

  it("lets an image-only message be edited back to empty content", async () => {
    const { ada, channelId } = await seed();

    stubStorage();

    const posted = await send(ada, channelId, {
      content: "",
      nonce: randomUUID(),
      attachments: [{ objectKey: keyFor(ada.id), filename: "diagram.png" }],
    });

    expect(posted.status).toBe(201);

    const { id } = messageBody.parse(posted.body);

    expect((await edit(ada, channelId, id, "a caption")).status).toBe(200);

    const cleared = await edit(ada, channelId, id, "");

    expect(cleared.status).toBe(200);
    expect(messageBody.parse(cleared.body).content).toBe("");
  });

  it("refuses to empty a message that carries no attachment", async () => {
    const { ada, channelId } = await seed();

    const posted = await send(ada, channelId, {
      content: "words only",
      nonce: randomUUID(),
    });

    expect(posted.status).toBe(201);

    const res = await edit(
      ada,
      channelId,
      messageBody.parse(posted.body).id,
      "   ",
    );

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "CONTENT_REQUIRED" } });
  });
});
