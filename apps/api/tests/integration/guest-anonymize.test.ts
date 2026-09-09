import { randomUUID } from "node:crypto";

import { count, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  channels,
  mentions,
  messages,
  serverMembers,
  users,
} from "../../src/db/schema/index.js";
import { runGuestAnonymize } from "../../src/jobs/guest-anonymize.js";
import { runGuestExpiry } from "../../src/jobs/guest-expiry.js";
import * as storage from "../../src/lib/storage.js";
import { type Account, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

const userBody = z.object({ user: z.object({ id: z.string() }) });
const idBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string() }));
const unreadList = z.array(
  z.object({
    id: z.string(),
    hasUnread: z.boolean(),
    hasEveryone: z.boolean(),
    mentionCount: z.number(),
  }),
);

async function signInAnonymously(): Promise<Account> {
  const res = await request(app).post("/api/auth/sign-in/anonymous").send({});

  expect(res.status).toBe(200);

  return {
    id: userBody.parse(res.body).user.id,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

function send(account: Account, channelId: string, content: string) {
  return request(app)
    .post(`/api/v1/channels/${channelId}/messages`)
    .set("Cookie", account.cookies)
    .send({ content, nonce: randomUUID() });
}

interface World {
  guest: Account;
  host: Account;
  serverId: string;
  channelId: string;
}

async function seedWorld(): Promise<World> {
  const host = await signUp("grace");
  const guest = await signInAnonymously();

  const created = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", host.cookies)
    .send({ name: "Shared" });

  const serverId = idBody.parse(created.body).id;

  await db.insert(serverMembers).values({ serverId, userId: guest.id });

  const listed = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", host.cookies);

  const [channel] = channelList.parse(listed.body);

  if (channel === undefined) {
    throw new Error("the fixture is incomplete");
  }

  return { guest, host, serverId, channelId: channel.id };
}

async function expireAndSweep(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ guestExpiresAt: new Date(Date.now() - 1000) })
    .where(eq(users.id, userId));

  await runGuestExpiry();
}

describe("guest anonymization", () => {
  beforeAll(requireTestDatabase);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps every message invariant while redacting the guest", async () => {
    const world = await seedWorld();

    await send(world.host, world.channelId, "an older message from the host");

    const mention = await send(
      world.guest,
      world.channelId,
      `hello @grace, and @everyone too`,
    );

    expect(mention.status).toBe(201);

    const pinned = await request(app)
      .put(
        `/api/v1/channels/${world.channelId}/messages/${idBody.parse(mention.body).id}/pin`,
      )
      .set("Cookie", world.host.cookies);

    expect(pinned.status).toBe(200);

    const before = await db.query.channels.findFirst({
      columns: { lastMessageId: true, lastEveryoneMentionId: true },
      where: { id: world.channelId },
    });

    expect(before?.lastMessageId).toBe(idBody.parse(mention.body).id);

    await expireAndSweep(world.guest.id);

    const result = await runGuestAnonymize();

    expect(result.anonymized).toBe(1);
    expect(result.messagesHidden).toBe(1);

    const identity = await db.query.users.findFirst({
      columns: {
        username: true,
        name: true,
        email: true,
        image: true,
        avatarObjectKey: true,
      },
      where: { id: world.guest.id },
    });

    expect(identity).toEqual({
      username: `former-guest-${world.guest.id}`,
      name: "Former guest",
      email: `deleted+${world.guest.id}@invalid`,
      image: null,
      avatarObjectKey: null,
    });

    const [remaining] = await db
      .select({ value: count() })
      .from(mentions)
      .where(eq(mentions.userId, world.host.id));

    expect(remaining?.value).toBe(0);

    const pins = await request(app)
      .get(`/api/v1/channels/${world.channelId}/pins`)
      .set("Cookie", world.host.cookies);

    expect(z.array(z.unknown()).parse(pins.body)).toHaveLength(0);

    const after = await db.query.channels.findFirst({
      columns: { lastMessageId: true, lastEveryoneMentionId: true },
      where: { id: world.channelId },
    });

    const newest = await db
      .select({ id: messages.id })
      .from(messages)
      .where(isNull(messages.deletedAt));

    expect(after?.lastMessageId).toBe(newest[0]?.id);
    expect(after?.lastEveryoneMentionId).toBeNull();

    const badges = await request(app)
      .get(`/api/v1/servers/${world.serverId}/channels`)
      .set("Cookie", world.host.cookies);

    const entry = unreadList
      .parse(badges.body)
      .find((row) => row.id === world.channelId);

    expect(entry?.mentionCount).toBe(0);
    expect(entry?.hasEveryone).toBe(false);
  });

  it("deletes the avatar object it cleared", async () => {
    const world = await seedWorld();

    vi.spyOn(storage, "headObject").mockResolvedValue({
      contentType: "image/png",
      size: 1024,
      lastModified: new Date(),
    });

    const deleted = vi.spyOn(storage, "deleteObject").mockResolvedValue();
    const key = `avatars/${world.guest.id}/${randomUUID()}.png`;

    await request(app)
      .patch("/api/v1/users/@me")
      .set("Cookie", world.guest.cookies)
      .send({ avatarObjectKey: key });

    await expireAndSweep(world.guest.id);
    await runGuestAnonymize();

    expect(deleted).toHaveBeenCalledWith(key);
  });

  it("renames nobody twice", async () => {
    const world = await seedWorld();

    await send(world.guest, world.channelId, "hello");
    await expireAndSweep(world.guest.id);

    expect((await runGuestAnonymize()).anonymized).toBe(1);
    expect((await runGuestAnonymize()).anonymized).toBe(0);

    const identity = await db.query.users.findFirst({
      columns: { username: true },
      where: { id: world.guest.id },
    });

    expect(identity?.username).toBe(`former-guest-${world.guest.id}`);
  });

  it("clears the description and the custom status too", async () => {
    const world = await seedWorld();

    await send(world.guest, world.channelId, "hello");

    const described = await request(app)
      .patch("/api/v1/users/@me")
      .set("Cookie", world.guest.cookies)
      .send({
        description: "Computer Science @ Waterloo",
        customStatus: "shipping bugs",
        customStatusEmoji: "🐛",
      });

    expect(described.status).toBe(200);

    await expireAndSweep(world.guest.id);
    await runGuestAnonymize();

    const identity = await db.query.users.findFirst({
      columns: {
        name: true,
        description: true,
        customStatus: true,
        customStatusEmoji: true,
      },
      where: { id: world.guest.id },
    });

    expect(identity).toMatchObject({
      name: "Former guest",
      description: null,
      customStatus: null,
      customStatusEmoji: null,
    });
  });

  it("tries the hard delete again on a later pass", async () => {
    const world = await seedWorld();

    await expireAndSweep(world.guest.id);

    const failing = vi.spyOn(db, "delete").mockImplementationOnce(() => {
      throw new Error("the connection went away");
    });

    await expect(runGuestAnonymize()).rejects.toThrow("the connection");

    failing.mockRestore();

    expect((await runGuestAnonymize()).deleted).toBe(1);

    await expect(
      db.query.users.findFirst({
        columns: { id: true },
        where: { id: world.guest.id },
      }),
    ).resolves.toBeUndefined();
  });

  it("retains a guest who posted and deletes one who only looked", async () => {
    const world = await seedWorld();
    const looker = await signInAnonymously();

    await send(world.guest, world.channelId, "I was here");
    await expireAndSweep(world.guest.id);
    await expireAndSweep(looker.id);

    const result = await runGuestAnonymize();

    expect(result.anonymized).toBe(2);
    expect(result.deleted).toBe(1);

    const poster = await db.query.users.findFirst({
      columns: { id: true },
      where: { id: world.guest.id },
    });
    const gone = await db.query.users.findFirst({
      columns: { id: true },
      where: { id: looker.id },
    });

    expect(poster?.id).toBe(world.guest.id);
    expect(gone).toBeUndefined();
  });

  it("leaves a live guest alone", async () => {
    const world = await seedWorld();

    await send(world.guest, world.channelId, "still here");

    expect((await runGuestAnonymize()).anonymized).toBe(0);

    const [live] = await db
      .select({ value: count() })
      .from(messages)
      .where(isNull(messages.deletedAt));

    expect(live?.value).toBe(1);

    const untouched = await db.query.channels.findFirst({
      columns: { lastMessageId: true },
      where: { id: world.channelId },
    });

    expect(untouched?.lastMessageId).not.toBeNull();
  });

  it("leaves a deactivated registered account and its history alone", async () => {
    const world = await seedWorld();

    await send(world.host, world.channelId, "the host's message");

    await db
      .update(users)
      .set({ deactivatedAt: new Date() })
      .where(eq(users.id, world.host.id));

    expect((await runGuestAnonymize()).anonymized).toBe(0);

    const host = await db.query.users.findFirst({
      columns: { username: true, email: true, name: true },
      where: { id: world.host.id },
    });

    expect(host).toMatchObject({ username: "grace", name: "grace" });
    expect(host?.email).toBe("grace@example.com");

    const [live] = await db
      .select({ value: count() })
      .from(messages)
      .where(isNull(messages.deletedAt));

    expect(live?.value).toBe(1);
  });

  it("anonymizes the expired guest beside that deactivated account", async () => {
    const world = await seedWorld();

    await send(world.host, world.channelId, "the host's message");
    await send(world.guest, world.channelId, "the guest's message");

    await db
      .update(users)
      .set({ deactivatedAt: new Date() })
      .where(eq(users.id, world.host.id));

    await expireAndSweep(world.guest.id);

    expect((await runGuestAnonymize()).anonymized).toBe(1);

    const survivors = await db
      .select({ authorId: messages.authorId })
      .from(messages)
      .where(isNull(messages.deletedAt));

    expect(survivors.map((row) => row.authorId)).toEqual([world.host.id]);
  });

  it("does not touch another user's messages", async () => {
    const world = await seedWorld();

    await send(world.host, world.channelId, "the host's message");
    await send(world.guest, world.channelId, "the guest's message");

    await expireAndSweep(world.guest.id);
    await runGuestAnonymize();

    const survivors = await db
      .select({ authorId: messages.authorId })
      .from(messages)
      .innerJoin(channels, eq(channels.id, messages.channelId))
      .where(isNull(messages.deletedAt));

    expect(survivors.map((row) => row.authorId)).toEqual([world.host.id]);
  });
});
