import { randomUUID } from "node:crypto";

import { count, eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { type Account, signUp } from "../helpers/accounts.js";

vi.hoisted(() => {
  process.env["GUEST_MESSAGE_CEILING"] = "2";
  process.env["GUEST_SERVER_CEILING"] = "2";
  process.env["GUEST_UPLOAD_GRANT_CEILING"] = "2";
});

const { app } = await import("../../src/app.js");
const { db } = await import("../../src/db/index.js");
const { guestQuotas, messages, servers } =
  await import("../../src/db/schema/index.js");
const { requireTestDatabase } = await import("../setup.js");

const idBody = z.object({ id: z.string() });
const userBody = z.object({ user: z.object({ id: z.string() }) });
const channelList = z.array(z.object({ id: z.string() }));

async function signInAnonymously(): Promise<Account> {
  const res = await request(app).post("/api/auth/sign-in/anonymous").send({});

  expect(res.status).toBe(200);

  return {
    id: userBody.parse(res.body).user.id,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

function createServer(account: Account, name: string) {
  return request(app)
    .post("/api/v1/servers")
    .set("Cookie", account.cookies)
    .send({ name });
}

async function firstChannel(
  account: Account,
  serverId: string,
): Promise<string> {
  const listed = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", account.cookies);

  const [channel] = channelList.parse(listed.body);

  if (channel === undefined) {
    throw new Error("the new server has no channel");
  }

  return channel.id;
}

function send(account: Account, channelId: string, nonce = randomUUID()) {
  return request(app)
    .post(`/api/v1/channels/${channelId}/messages`)
    .set("Cookie", account.cookies)
    .send({ content: "hello", nonce });
}

function grant(account: Account) {
  return request(app)
    .post("/api/v1/uploads")
    .set("Cookie", account.cookies)
    .send({
      kind: "attachment",
      filename: "shot.png",
      contentType: "image/png",
      size: 1024,
    });
}

describe("guest quotas", () => {
  beforeAll(requireTestDatabase);

  it("stops a guest at the message ceiling and counts exactly", async () => {
    const guest = await signInAnonymously();
    const created = await createServer(guest, "Sandbox");
    const channelId = await firstChannel(guest, idBody.parse(created.body).id);

    expect((await send(guest, channelId)).status).toBe(201);
    expect((await send(guest, channelId)).status).toBe(201);

    const refused = await send(guest, channelId);

    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({
      error: {
        code: "GUEST_QUOTA_REACHED",
        details: { quota: "messages_sent", limit: 2 },
      },
    });

    const [written] = await db.select({ value: count() }).from(messages);

    expect(written?.value).toBe(2);
  });

  it("charges a replayed nonce once, however often it is retried", async () => {
    const guest = await signInAnonymously();
    const created = await createServer(guest, "Sandbox");
    const channelId = await firstChannel(guest, idBody.parse(created.body).id);
    const nonce = randomUUID();

    expect((await send(guest, channelId, nonce)).status).toBe(201);

    for (const attempt of [2, 3]) {
      const replay = await send(guest, channelId, nonce);

      expect(replay.status, `attempt ${String(attempt)}`).toBe(200);
      expect(replay.body).toMatchObject({ nonce });
    }

    const row = await db.query.guestQuotas.findFirst({
      columns: { messagesSent: true },
      where: { userId: guest.id },
    });

    expect(row?.messagesSent).toBe(1);

    const [written] = await db.select({ value: count() }).from(messages);

    expect(written?.value).toBe(1);

    expect((await send(guest, channelId)).status).toBe(201);
    expect((await send(guest, channelId)).status).toBe(403);
  });

  it("never lets concurrent sends take the last slot twice", async () => {
    const guest = await signInAnonymously();
    const created = await createServer(guest, "Sandbox");
    const channelId = await firstChannel(guest, idBody.parse(created.body).id);

    const results = await Promise.all(
      Array.from({ length: 8 }, () => send(guest, channelId)),
    );

    expect(results.filter((res) => res.status === 201)).toHaveLength(2);

    const [written] = await db.select({ value: count() }).from(messages);
    const row = await db.query.guestQuotas.findFirst({
      columns: { messagesSent: true },
      where: { userId: guest.id },
    });

    expect(written?.value).toBe(2);
    expect(row?.messagesSent).toBe(2);
  });

  it("holds the same shape for servers and upload grants", async () => {
    const guest = await signInAnonymously();

    expect((await createServer(guest, "One")).status).toBe(201);
    expect((await createServer(guest, "Two")).status).toBe(201);

    const refusedServer = await createServer(guest, "Three");

    expect(refusedServer.status).toBe(403);
    expect(refusedServer.body).toMatchObject({
      error: { details: { quota: "servers_created" } },
    });

    const [built] = await db.select({ value: count() }).from(servers);

    expect(built?.value).toBe(2);

    expect((await grant(guest)).status).toBe(201);
    expect((await grant(guest)).status).toBe(201);

    const refusedGrant = await grant(guest);

    expect(refusedGrant.status).toBe(403);
    expect(refusedGrant.body).toMatchObject({
      error: { details: { quota: "upload_grants" } },
    });
  });

  it("leaves a registered account unlimited and unrecorded", async () => {
    const ada = await signUp("ada");
    const created = await createServer(ada, "First");
    const channelId = await firstChannel(ada, idBody.parse(created.body).id);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await send(ada, channelId)).status).toBe(201);
    }

    expect((await createServer(ada, "Second")).status).toBe(201);
    expect((await createServer(ada, "Third")).status).toBe(201);
    expect((await grant(ada)).status).toBe(201);
    expect((await grant(ada)).status).toBe(201);
    expect((await grant(ada)).status).toBe(201);

    const rows = await db
      .select({ value: count() })
      .from(guestQuotas)
      .where(eq(guestQuotas.userId, ada.id));

    expect(rows[0]?.value).toBe(0);
  });
});
