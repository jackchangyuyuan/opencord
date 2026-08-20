import { Permissions } from "@opencord/shared/permissions";
import { and, DrizzleQueryError, eq } from "drizzle-orm";
import postgres from "postgres";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  auditLog,
  channels,
  roles,
  serverMembers,
} from "../../src/db/schema/index.js";
import { requireTestDatabase } from "../setup.js";

const CHECK_VIOLATION = "23514";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const serverBody = z.object({ id: z.string() });
const channelBody = z.object({
  id: z.string(),
  serverId: z.string(),
  type: z.literal("text"),
  name: z.string(),
  topic: z.string().nullable(),
  position: z.number(),
  lastMessageId: z.null(),
  createdAt: z.string(),
});
const channelList = z.array(channelBody);

interface Account {
  id: string;
  cookies: string[];
}

async function rejection(
  statement: () => Promise<unknown>,
): Promise<postgres.PostgresError> {
  try {
    await statement();
  } catch (error) {
    if (
      error instanceof DrizzleQueryError &&
      error.cause instanceof postgres.PostgresError
    ) {
      return error.cause;
    }

    throw error;
  }

  throw new Error("expected the statement to be rejected");
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

async function join(serverId: string, account: Account): Promise<void> {
  await db.insert(serverMembers).values({ serverId, userId: account.id });
}

function listChannels(account: Account, serverId: string) {
  return request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", account.cookies);
}

function getChannel(account: Account, channelId: string) {
  return request(app)
    .get(`/api/v1/channels/${channelId}`)
    .set("Cookie", account.cookies);
}

function patchChannel(
  account: Account,
  channelId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .patch(`/api/v1/channels/${channelId}`)
    .set("Cookie", account.cookies)
    .send(body);
}

async function firstChannel(
  account: Account,
  serverId: string,
): Promise<string> {
  const res = await listChannels(account, serverId);
  const [channel] = channelList.parse(res.body);

  if (channel === undefined) {
    throw new Error("the server has no channels");
  }

  return channel.id;
}

function postChannel(
  account: Account,
  serverId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", account.cookies)
    .send(body);
}

describe("server creation now also creates the default channels", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("creates them in order inside the same transaction", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await listChannels(ada, serverId);

    expect(res.status).toBe(200);
    expect(channelList.parse(res.body).map((channel) => channel.name)).toEqual([
      "general",
      "random",
    ]);
  });

  it("writes no channel_create audit rows for them", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    expect(
      await db.select().from(auditLog).where(eq(auditLog.serverId, serverId)),
    ).toEqual([]);
  });
});

describe("POST /api/v1/servers/:serverId/channels", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("appends the channel and audits it", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await postChannel(ada, serverId, {
      name: "engines",
      topic: "  cogs and cams  ",
    });

    expect(res.status).toBe(201);

    const channel = channelBody.parse(res.body);

    expect(channel).toMatchObject({
      serverId,
      type: "text",
      name: "engines",
      topic: "cogs and cams",
      position: 2,
    });

    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.serverId, serverId));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: ada.id,
      action: "channel_create",
      targetType: "channel",
      targetId: channel.id,
      metadata: { name: "engines" },
    });
  });

  it("rejects an uppercase name", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await postChannel(ada, serverId, { name: "Engines" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect(await db.select().from(channels)).toHaveLength(2);
  });

  it("rejects a member without MANAGE_CHANNELS", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);

    const res = await postChannel(grace, serverId, { name: "engines" });

    expect(res.status).toBe(403);
    expect(await db.select().from(channels)).toHaveLength(2);
  });

  it("admits a member granted MANAGE_CHANNELS", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);
    await db
      .update(roles)
      .set({
        permissions: Permissions.VIEW_CHANNEL | Permissions.MANAGE_CHANNELS,
      })
      .where(and(eq(roles.serverId, serverId), eq(roles.isDefault, true)));

    expect(
      (await postChannel(grace, serverId, { name: "engines" })).status,
    ).toBe(201);
  });

  it("rejects a non-member", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    expect(
      (await postChannel(grace, serverId, { name: "engines" })).status,
    ).toBe(403);
  });
});

describe("the channels CHECK constraint", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("refuses a text channel with no server", async () => {
    const error = await rejection(() =>
      db.insert(channels).values({ serverId: null, type: "text" }),
    );

    expect(error.code).toBe(CHECK_VIOLATION);
    expect(error.constraint_name).toBe("channels_dm_without_server_check");
  });

  it("refuses a dm channel that names a server", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    await expect(
      db.insert(channels).values({ serverId, type: "dm" }),
    ).rejects.toThrow();
  });

  it("accepts a dm channel with no server", async () => {
    await db.insert(channels).values({ serverId: null, type: "dm" });

    const rows = await db.select().from(channels);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ serverId: null, type: "dm", name: null });
  });
});

describe("channel deletion follows the server", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("cascades from servers", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    expect(await db.select().from(channels)).toHaveLength(2);

    await request(app)
      .delete(`/api/v1/servers/${serverId}`)
      .set("Cookie", ada.cookies);

    expect(await db.select().from(channels)).toEqual([]);
  });
});

describe("GET /api/v1/channels/:channelId", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("serves a channel by id alone", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");
    const channelId = await firstChannel(ada, serverId);

    const res = await getChannel(ada, channelId);

    expect(res.status).toBe(200);
    expect(channelBody.parse(res.body)).toMatchObject({
      id: channelId,
      serverId,
      name: "general",
    });
  });

  it("rejects a caller who is not a member of its server", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");
    const channelId = await firstChannel(ada, serverId);

    expect((await getChannel(grace, channelId)).status).toBe(403);
  });

  it("answers 404 for an unknown channel", async () => {
    const ada = await signUp("ada");

    const res = await getChannel(ada, "00000000-0000-7000-8000-000000000000");

    expect(res.status).toBe(404);
  });

  it("answers 404 for a channel with no server", async () => {
    const ada = await signUp("ada");
    const [dm] = await db
      .insert(channels)
      .values({ serverId: null, type: "dm" })
      .returning({ id: channels.id });

    expect((await getChannel(ada, dm?.id ?? "")).status).toBe(404);
  });
});

describe("PATCH /api/v1/channels/:channelId", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("renames and retopics the channel, and audits it", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");
    const channelId = await firstChannel(ada, serverId);

    const res = await patchChannel(ada, channelId, {
      name: "engines",
      topic: "cogs",
    });

    expect(res.status).toBe(200);
    expect(channelBody.parse(res.body)).toMatchObject({
      name: "engines",
      topic: "cogs",
    });

    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.serverId, serverId));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "channel_update",
      targetType: "channel",
      targetId: channelId,
      metadata: { name: "engines", topic: "cogs" },
    });
  });

  it("clears a topic with an explicit null", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");
    const channelId = await firstChannel(ada, serverId);

    await patchChannel(ada, channelId, { topic: "cogs" });

    const res = await patchChannel(ada, channelId, { topic: null });

    expect(res.status).toBe(200);
    expect(channelBody.parse(res.body).topic).toBeNull();
  });

  it("reorders one channel at a time, ties broken by id", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");
    const channelId = await firstChannel(ada, serverId);

    expect((await patchChannel(ada, channelId, { position: 9 })).status).toBe(
      200,
    );

    const res = await listChannels(ada, serverId);

    expect(channelList.parse(res.body).map((channel) => channel.name)).toEqual([
      "random",
      "general",
    ]);
  });

  it("rejects an uppercase name", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");
    const channelId = await firstChannel(ada, serverId);

    const res = await patchChannel(ada, channelId, { name: "General" });

    expect(res.status).toBe(400);
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("rejects a body with nothing to update", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");
    const channelId = await firstChannel(ada, serverId);

    expect((await patchChannel(ada, channelId, {})).status).toBe(400);
  });

  it("rejects a member without MANAGE_CHANNELS", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");
    const channelId = await firstChannel(ada, serverId);

    await join(serverId, grace);

    const res = await patchChannel(grace, channelId, { name: "engines" });

    expect(res.status).toBe(403);
    expect(await db.select().from(auditLog)).toEqual([]);
  });
});

describe("DELETE /api/v1/channels/:channelId", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("removes the channel and audits it", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");
    const channelId = await firstChannel(ada, serverId);

    const res = await request(app)
      .delete(`/api/v1/channels/${channelId}`)
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(204);
    expect(await db.select().from(channels)).toHaveLength(1);

    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.serverId, serverId));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "channel_delete",
      targetId: channelId,
      metadata: { name: "general" },
    });
  });

  it("rejects a member without MANAGE_CHANNELS", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");
    const channelId = await firstChannel(ada, serverId);

    await join(serverId, grace);

    const res = await request(app)
      .delete(`/api/v1/channels/${channelId}`)
      .set("Cookie", grace.cookies);

    expect(res.status).toBe(403);
    expect(await db.select().from(channels)).toHaveLength(2);
  });
});
