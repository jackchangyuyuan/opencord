import { DrizzleQueryError, eq } from "drizzle-orm";
import postgres from "postgres";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "../../src/db/index.js";
import {
  channels,
  messages,
  servers,
  users,
} from "../../src/db/schema/index.js";
import { requireTestDatabase } from "../setup.js";

const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

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

async function seedUser(id: string): Promise<string> {
  await db
    .insert(users)
    .values({ id, name: id, email: `${id}@example.com`, username: id });

  return id;
}

async function seedChannel(name: string, ownerId: string): Promise<string> {
  const [server] = await db
    .insert(servers)
    .values({ name, ownerId })
    .returning({ id: servers.id });

  const [channel] = await db
    .insert(channels)
    .values({ serverId: server?.id ?? "", type: "text", name })
    .returning({ id: channels.id });

  if (channel === undefined) {
    throw new Error("the channel insert returned no row");
  }

  return channel.id;
}

async function seedMessage(
  channelId: string,
  authorId: string,
  content: string,
  extra: { replyToId?: string; nonce?: string } = {},
): Promise<string> {
  const [message] = await db
    .insert(messages)
    .values({ channelId, authorId, content, ...extra })
    .returning({ id: messages.id });

  if (message === undefined) {
    throw new Error("the message insert returned no row");
  }

  return message.id;
}

describe("the reply composite foreign key", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("refuses a reply that targets a message in another channel", async () => {
    const ada = await seedUser("ada");
    const channelA = await seedChannel("a", ada);
    const channelB = await seedChannel("b", ada);
    const quoted = await seedMessage(channelA, ada, "in A");

    const error = await rejection(() =>
      seedMessage(channelB, ada, "reply from B", { replyToId: quoted }),
    );

    expect(error.code).toBe(FOREIGN_KEY_VIOLATION);
    expect(error.constraint_name).toBe("messages_reply_to_id_channel_id_fkey");
  });

  it("accepts a reply inside the same channel", async () => {
    const ada = await seedUser("ada");
    const channel = await seedChannel("a", ada);
    const quoted = await seedMessage(channel, ada, "original");
    const reply = await seedMessage(channel, ada, "reply", {
      replyToId: quoted,
    });

    const stored = await db.query.messages.findFirst({
      columns: { replyToId: true },
      where: { id: reply },
    });

    expect(stored?.replyToId).toBe(quoted);
  });

  it("nulls only reply_to_id when the quoted message is hard-deleted", async () => {
    const ada = await seedUser("ada");
    const channel = await seedChannel("a", ada);
    const quoted = await seedMessage(channel, ada, "original");
    const reply = await seedMessage(channel, ada, "reply", {
      replyToId: quoted,
    });

    await db.delete(messages).where(eq(messages.id, quoted));

    const survivor = await db.query.messages.findFirst({
      where: { id: reply },
    });

    expect(survivor).toBeDefined();
    expect(survivor?.replyToId).toBeNull();
    expect(survivor?.channelId).toBe(channel);
    expect(survivor?.content).toBe("reply");
  });
});

describe("the nonce partial unique index", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("refuses a second message with the same author and nonce", async () => {
    const ada = await seedUser("ada");
    const channel = await seedChannel("a", ada);
    const nonce = "00000000-0000-7000-8000-00000000000a";

    await seedMessage(channel, ada, "first", { nonce });

    const error = await rejection(() =>
      seedMessage(channel, ada, "second", { nonce }),
    );

    expect(error.code).toBe(UNIQUE_VIOLATION);
    expect(error.constraint_name).toBe("messages_author_id_nonce_uidx");
  });

  it("leaves messages without a nonce unconstrained", async () => {
    const ada = await seedUser("ada");
    const channel = await seedChannel("a", ada);

    await seedMessage(channel, ada, "first");
    await seedMessage(channel, ada, "second");

    expect(await db.select().from(messages)).toHaveLength(2);
  });

  it("scopes the nonce to its author", async () => {
    const ada = await seedUser("ada");
    const grace = await seedUser("grace");
    const channel = await seedChannel("a", ada);
    const nonce = "00000000-0000-7000-8000-00000000000a";

    await seedMessage(channel, ada, "hers", { nonce });
    await seedMessage(channel, grace, "his", { nonce });

    expect(await db.select().from(messages)).toHaveLength(2);
  });
});

describe("message lifetime is tied to the channel, not the author", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("cascades when the channel is deleted", async () => {
    const ada = await seedUser("ada");
    const channel = await seedChannel("a", ada);

    await seedMessage(channel, ada, "hello");
    await db.delete(channels).where(eq(channels.id, channel));

    expect(await db.select().from(messages)).toEqual([]);
  });

  it("refuses to delete an author who still has messages", async () => {
    const ada = await seedUser("ada");
    const grace = await seedUser("grace");
    const channel = await seedChannel("a", ada);

    await seedMessage(channel, grace, "hello");

    const error = await rejection(() =>
      db.delete(users).where(eq(users.id, grace)),
    );

    expect(error.code).toBe(FOREIGN_KEY_VIOLATION);
    expect(error.constraint_name).toBe("messages_author_id_users_id_fkey");
  });
});

describe("the uuidv7() default on messages", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("orders generated identifiers by insertion time", async () => {
    const ada = await seedUser("ada");
    const channel = await seedChannel("a", ada);

    const first = await seedMessage(channel, ada, "first");
    const second = await seedMessage(channel, ada, "second");

    expect(first < second).toBe(true);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
