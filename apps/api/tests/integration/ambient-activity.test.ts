import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { config } from "../../src/config.js";
import { db } from "../../src/db/index.js";
import {
  channels,
  messages,
  reactions,
  servers,
  users,
} from "../../src/db/schema/index.js";
import { runAmbientActivity } from "../../src/jobs/ambient-activity.js";
import { redis } from "../../src/redis.js";
import {
  readAggregate,
  readConnections,
  SWEEP_AFTER_MS,
  sweepPresence,
} from "../../src/socket/presence.js";
import type { SocketServer } from "../../src/socket/types.js";
import { requireTestDatabase } from "../setup.js";

const io = {
  to: () => ({ emit: () => undefined }),
} as unknown as SocketServer;

const SEEN_KEY = "presence:seen";

interface Fixture {
  guestId: string;
  personaId: string;
  communityChannelId: string;
  sandboxChannelId: string;
}

async function seedUser(
  id: string,
  username: string,
  anonymous: boolean,
): Promise<void> {
  await db.insert(users).values({
    id,
    name: username,
    email: `${username}@example.com`,
    username,
    isAnonymous: anonymous,
  });
}

async function seed(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const guestId = `guest-${suffix}`;
  const personaId = `persona-${suffix}`;

  await seedUser(guestId, `guest${suffix}`, true);
  await seedUser(personaId, `seed-ada-${suffix}`, false);

  const [community] = await db
    .insert(servers)
    .values({ name: "OpenCord HQ", ownerId: personaId })
    .returning({ id: servers.id });

  const [sandbox] = await db
    .insert(servers)
    .values({ name: "OpenCord HQ", ownerId: guestId, isDemoSandbox: true })
    .returning({ id: servers.id });

  const [communityChannel] = await db
    .insert(channels)
    .values({ serverId: community?.id ?? "", type: "text", name: "general" })
    .returning({ id: channels.id });

  const [sandboxChannel] = await db
    .insert(channels)
    .values({ serverId: sandbox?.id ?? "", type: "text", name: "general" })
    .returning({ id: channels.id });

  const communityChannelId = communityChannel?.id ?? "";
  const sandboxChannelId = sandboxChannel?.id ?? "";

  await db.insert(messages).values([
    { channelId: communityChannelId, authorId: personaId, content: "seeded" },
    { channelId: sandboxChannelId, authorId: personaId, content: "seeded" },
  ]);

  return { guestId, personaId, communityChannelId, sandboxChannelId };
}

async function goOnline(userId: string): Promise<void> {
  await redis.zadd(SEEN_KEY, Date.now(), `${userId}:socket-1`);
}

async function goOffline(userId: string): Promise<void> {
  await redis.zrem(SEEN_KEY, `${userId}:socket-1`);
}

function countIn(channelId: string): Promise<number> {
  return db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.channelId, channelId))
    .then((rows) => rows.length);
}

let fixture: Fixture;

describe("the ambient-activity job", () => {
  beforeAll(requireTestDatabase);

  beforeEach(async () => {
    fixture = await seed();
  });

  afterEach(async () => {
    await goOffline(fixture.guestId);
  });

  it("performs no writes while no guest is online", async () => {
    const before = await countIn(fixture.communityChannelId);

    expect(await runAmbientActivity()).toEqual({
      posted: 0,
      reacted: 0,
      typed: 0,
      pruned: 0,
      present: 0,
    });

    expect(await countIn(fixture.communityChannelId)).toBe(before);
    expect(await readConnections(fixture.personaId)).toEqual([]);
  });

  it("brings the seeded cast online while a guest is watching", async () => {
    await goOnline(fixture.guestId);

    const result = await runAmbientActivity();

    expect(result.present).toBeGreaterThan(0);
    expect(await readAggregate(fixture.personaId)).not.toBe("offline");

    const [connection] = await readConnections(fixture.personaId);

    expect(connection?.instanceId).toBe(config.INSTANCE_ID);
    expect(
      await redis.zscore(SEEN_KEY, `${fixture.personaId}:demo-ambient`),
    ).not.toBeNull();
  });

  it("leaves the cast to the ordinary sweep once nobody is watching", async () => {
    await goOnline(fixture.guestId);
    await runAmbientActivity();
    await goOffline(fixture.guestId);

    const stale = Date.now() - SWEEP_AFTER_MS - 1000;

    await redis.zadd(SEEN_KEY, stale, `${fixture.personaId}:demo-ambient`);
    await sweepPresence(io, Date.now());

    expect(await readAggregate(fixture.personaId)).toBe("offline");
  });

  it("posts into the community channel once a guest is online", async () => {
    await goOnline(fixture.guestId);

    const result = await runAmbientActivity();

    expect(result.posted).toBe(1);
    expect(result.typed).toBe(1);
    expect(await countIn(fixture.communityChannelId)).toBe(2);
  });

  it("never writes into a server flagged as a demo sandbox", async () => {
    await goOnline(fixture.guestId);

    const before = await countIn(fixture.sandboxChannelId);

    await runAmbientActivity();

    expect(await countIn(fixture.sandboxChannelId)).toBe(before);
  });

  it("does not leave a reaction on every message it posts", async () => {
    await goOnline(fixture.guestId);

    for (let tick = 0; tick < 12; tick += 1) {
      await runAmbientActivity(
        new Date(
          Date.now() + tick * (config.AMBIENT_ACTIVITY_INTERVAL_MS + 1000),
        ),
      );
    }

    const rows = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.channelId, fixture.communityChannelId));

    const reacted = await db
      .selectDistinct({ messageId: reactions.messageId })
      .from(reactions);

    expect(rows.length).toBeGreaterThan(6);
    expect(reacted.length).toBeLessThan(rows.length);
  });

  it("does not double-post when the tick runs twice", async () => {
    await goOnline(fixture.guestId);

    expect((await runAmbientActivity()).posted).toBe(1);
    expect((await runAmbientActivity()).posted).toBe(0);
    expect(await countIn(fixture.communityChannelId)).toBe(2);
  });

  it("prunes its own old messages and spares the seeded corpus", async () => {
    await goOnline(fixture.guestId);
    await runAmbientActivity();

    const aged = new Date(
      Date.now() - config.AMBIENT_ACTIVITY_RETENTION_MS - 60_000,
    );

    await db
      .update(messages)
      .set({ createdAt: aged })
      .where(
        and(
          eq(messages.channelId, fixture.communityChannelId),
          sql`${messages.nonce} is not null`,
        ),
      );

    const result = await runAmbientActivity(
      new Date(Date.now() + config.AMBIENT_ACTIVITY_INTERVAL_MS + 1000),
    );

    expect(result.pruned).toBe(1);

    const survivors = await db
      .select({ content: messages.content })
      .from(messages)
      .where(eq(messages.channelId, fixture.communityChannelId));

    expect(survivors.map((row) => row.content)).toContain("seeded");
  });
});
