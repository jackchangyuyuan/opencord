import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "../../src/db/index.js";
import {
  channelMembers,
  channels,
  messages,
  serverMembers,
  servers,
  users,
} from "../../src/db/schema/index.js";
import { clear } from "../../src/db/seed/clear.js";
import {
  COMMUNITY_SERVER_NAMES,
  SEED_USERNAME_PREFIX,
} from "../../src/modules/demo/dataset.js";
import { requireTestDatabase } from "../setup.js";

async function seedUser(id: string, username: string): Promise<string> {
  await db.insert(users).values({
    id,
    name: username,
    email: `${username}@example.invalid`,
    username,
  });

  return id;
}

async function persona(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);

  return seedUser(`persona-${suffix}`, `${SEED_USERNAME_PREFIX}ada-${suffix}`);
}

async function server(name: string, ownerId: string): Promise<string> {
  const [row] = await db
    .insert(servers)
    .values({ name, ownerId })
    .returning({ id: servers.id });

  if (row === undefined) {
    throw new Error("the fixture produced no server");
  }

  await db.insert(serverMembers).values({ serverId: row.id, userId: ownerId });

  return row.id;
}

async function channel(serverId: string, name: string): Promise<string> {
  const [row] = await db
    .insert(channels)
    .values({ serverId, type: "text", name })
    .returning({ id: channels.id });

  if (row === undefined) {
    throw new Error("the fixture produced no channel");
  }

  return row.id;
}

async function post(
  channelId: string,
  authorId: string,
  content: string,
): Promise<string> {
  const [row] = await db
    .insert(messages)
    .values({ channelId, authorId, content })
    .returning({ id: messages.id });

  if (row === undefined) {
    throw new Error("the fixture produced no message");
  }

  return row.id;
}

function serverExists(serverId: string): Promise<boolean> {
  return db.query.servers
    .findFirst({ columns: { id: true }, where: { id: serverId } })
    .then((row) => row !== undefined);
}

describe("the seed's cleanup pass", () => {
  beforeAll(requireTestDatabase);

  it("removes the servers a persona owns, and the personas", async () => {
    const owner = await persona();
    const seeded = await server(COMMUNITY_SERVER_NAMES[0], owner);

    await clear();

    await expect(serverExists(seeded)).resolves.toBe(false);
    await expect(
      db.query.users.findFirst({
        columns: { id: true },
        where: { id: owner },
      }),
    ).resolves.toBeUndefined();
  });

  it("spares a real user's server that happens to share the name", async () => {
    const ada = await seedUser(`ada-${randomUUID().slice(0, 8)}`, "ada");
    const theirs = await server(COMMUNITY_SERVER_NAMES[0], ada);

    await clear();

    await expect(serverExists(theirs)).resolves.toBe(true);
  });

  it("spares a claimed sandbox and takes only the persona's messages from it", async () => {
    const speaker = await persona();
    const ada = await seedUser(`ada-${randomUUID().slice(0, 8)}`, "ada");

    const sandbox = await server("Your sandbox", ada);
    const room = await channel(sandbox, "general");

    await db.insert(serverMembers).values({
      serverId: sandbox,
      userId: speaker,
    });

    const cloned = await post(room, speaker, "seeded conversation");
    const theirs = await post(room, ada, "something they wrote");

    await db
      .update(channels)
      .set({ lastMessageId: cloned })
      .where(eq(channels.id, room));

    await clear();

    await expect(serverExists(sandbox)).resolves.toBe(true);

    const remaining = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.channelId, room));

    expect(remaining.map((row) => row.id)).toEqual([theirs]);

    const room2 = await db.query.channels.findFirst({
      columns: { lastMessageId: true },
      where: { id: room },
    });

    expect(room2?.lastMessageId).toBe(theirs);
  });

  it("removes a direct message a persona was in", async () => {
    const speaker = await persona();
    const ada = await seedUser(`ada-${randomUUID().slice(0, 8)}`, "ada");

    const [dm] = await db
      .insert(channels)
      .values({ serverId: null, type: "dm" })
      .returning({ id: channels.id });

    if (dm === undefined) {
      throw new Error("the fixture produced no conversation");
    }

    await db.insert(channelMembers).values([
      { channelId: dm.id, userId: speaker },
      { channelId: dm.id, userId: ada },
    ]);

    await post(dm.id, speaker, "hello");

    await clear();

    await expect(
      db.query.channels.findFirst({
        columns: { id: true },
        where: { id: dm.id },
      }),
    ).resolves.toBeUndefined();
  });
});
