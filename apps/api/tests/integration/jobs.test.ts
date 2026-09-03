import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["JOB_LOCK_NAMESPACE"] =
    `jobs-runner-${Math.random().toString(36).slice(2)}`;
});

const { db } = await import("../../src/db/index.js");
const { attachments, channels, messages, servers, users } =
  await import("../../src/db/schema/index.js");
const { startJobRunner } = await import("../../src/jobs/index.js");
const { runOrphanSweep, SWEEP_THRESHOLD_MS } =
  await import("../../src/jobs/orphan-sweep.js");
const { LEADER_KEY } = await import("../../src/lib/leader-election.js");
const storage = await import("../../src/lib/storage.js");
const { redis } = await import("../../src/redis.js");
const { requireTestDatabase } = await import("../setup.js");

const OLD = new Date(Date.now() - SWEEP_THRESHOLD_MS - 60_000);
const FRESH = new Date();

async function seedUser(id: string): Promise<void> {
  await db.insert(users).values({
    id,
    name: id,
    email: `${id}@example.com`,
    username: id,
  });
}

describe("the job runner and its first job", () => {
  beforeAll(requireTestDatabase);

  beforeEach(async () => {
    vi.restoreAllMocks();
    await redis.del(LEADER_KEY);
  });

  it("lets exactly one runner take the lock, and the loser runs nothing", async () => {
    const sweep = vi.fn().mockResolvedValue(undefined);
    const job = { name: "probe", everyMs: 0, run: sweep };

    await redis.set(LEADER_KEY, randomUUID(), "EX", 30);

    const loser = startJobRunner([job]);

    await vi.waitFor(() => {
      expect(sweep).not.toHaveBeenCalled();
    });

    await loser.stop();
    await redis.del(LEADER_KEY);

    const winner = startJobRunner([job]);

    await vi.waitFor(() => {
      expect(sweep).toHaveBeenCalledTimes(1);
    });

    await winner.stop();

    expect(await redis.get(LEADER_KEY)).toBeNull();
  });

  it("skips the tick entirely when Redis will not answer", async () => {
    const sweep = vi.fn().mockResolvedValue(undefined);

    const set = vi
      .spyOn(redis, "set")
      .mockRejectedValue(new Error("Redis is down"));

    const runner = startJobRunner([{ name: "probe", everyMs: 0, run: sweep }]);

    await vi.waitFor(() => {
      expect(set).toHaveBeenCalled();
    });

    expect(sweep).not.toHaveBeenCalled();

    await runner.stop();
  });

  it("keeps running after a job throws", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("nope"));
    const following = vi.fn().mockResolvedValue(undefined);

    const runner = startJobRunner([
      { name: "failing", everyMs: 0, run: failing },
      { name: "following", everyMs: 0, run: following },
    ]);

    await vi.waitFor(() => {
      expect(following).toHaveBeenCalled();
    });

    await runner.stop();
  });

  it("waits for the job in flight before releasing the lease", async () => {
    let release = (): void => undefined;
    let began = (): void => undefined;

    const blocked = new Promise<void>((finish) => {
      release = finish;
    });
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });

    const runner = startJobRunner([
      {
        name: "blocked",
        everyMs: 0,
        run: async () => {
          began();
          await blocked;
        },
      },
    ]);

    await started;

    let stopped = false;
    const stopping = runner.stop().then(() => {
      stopped = true;
    });

    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(stopped).toBe(false);
    expect(await redis.get(LEADER_KEY)).not.toBeNull();

    release();
    await stopping;

    expect(stopped).toBe(true);
    expect(await redis.get(LEADER_KEY)).toBeNull();
  });

  it("deletes an unassociated object and spares a referenced one", async () => {
    const orphan = `attachments/nobody/${randomUUID()}.png`;
    const referenced = `attachments/somebody/${randomUUID()}.png`;
    const fresh = `attachments/somebody/${randomUUID()}.png`;
    const avatar = `avatars/somebody/${randomUUID()}.png`;
    const icon = `icons/somebody/${randomUUID()}.png`;

    const authorId = `sweeper-${randomUUID().slice(0, 8)}`;

    await seedUser(authorId);

    const [server] = await db
      .insert(servers)
      .values({ name: "Sweeper", ownerId: authorId, iconKey: icon })
      .returning({ id: servers.id });

    await db
      .update(users)
      .set({ avatarObjectKey: avatar })
      .where(eq(users.id, authorId));

    const [channel] = await db
      .insert(channels)
      .values({ serverId: server?.id ?? null, type: "text", name: "general" })
      .returning({ id: channels.id });

    const [message] = await db
      .insert(messages)
      .values({
        channelId: channel?.id ?? "",
        authorId,
        content: "with a file",
      })
      .returning({ id: messages.id });

    await db.insert(attachments).values({
      messageId: message?.id ?? "",
      objectKey: referenced,
      filename: "kept.png",
      contentType: "image/png",
      size: 1,
    });

    vi.spyOn(storage, "listObjectPages").mockImplementation(
      (prefix: string) => {
        const pages = [
          { objectKey: orphan, lastModified: OLD },
          { objectKey: referenced, lastModified: OLD },
          { objectKey: fresh, lastModified: FRESH },
          { objectKey: avatar, lastModified: OLD },
          { objectKey: icon, lastModified: OLD },
        ]
          .filter((object) => object.objectKey.startsWith(prefix))
          .map((object) => [object]);

        const remaining = pages[Symbol.iterator]();

        return {
          [Symbol.asyncIterator]: () => ({
            next: () => Promise.resolve(remaining.next()),
          }),
        };
      },
    );

    const deleted = vi.spyOn(storage, "deleteObject").mockResolvedValue();

    const result = await runOrphanSweep();

    expect(deleted).toHaveBeenCalledExactlyOnceWith(orphan);
    expect(result.deleted).toBe(1);
  });
});
