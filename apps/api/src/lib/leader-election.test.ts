import { randomUUID } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env["JOB_LOCK_NAMESPACE"] =
    `jobs-lock-${Math.random().toString(36).slice(2)}`;
});

const { redis } = await import("../redis.js");
const {
  acquireLeadership,
  LEADER_KEY: KEY,
  LEASE_SECONDS,
  leaderToken,
  releaseLeadership,
  renewLeadership,
} = await import("./leader-election.js");

async function stealLock(): Promise<string> {
  const other = randomUUID();

  await redis.set(KEY, other, "EX", LEASE_SECONDS);

  return other;
}

describe("the leader lock", () => {
  beforeEach(async () => {
    await redis.del(KEY);
  });

  afterAll(async () => {
    await redis.del(KEY);
  });

  it("is taken by exactly one caller", async () => {
    expect(await acquireLeadership()).toBe(true);
    expect(await redis.get(KEY)).toBe(leaderToken);

    await stealLock();

    expect(await acquireLeadership()).toBe(false);
  });

  it("holds a token, not an instance name", () => {
    expect(leaderToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("renews only its own lease", async () => {
    await acquireLeadership();

    expect(await renewLeadership()).toBe(true);
    expect(await redis.ttl(KEY)).toBeGreaterThan(0);

    const other = await stealLock();

    expect(await renewLeadership()).toBe(false);
    expect(await redis.get(KEY)).toBe(other);
  });

  it("releases only its own lease", async () => {
    const other = await stealLock();

    expect(await releaseLeadership()).toBe(false);
    expect(await redis.get(KEY)).toBe(other);

    await redis.del(KEY);
    await acquireLeadership();

    expect(await releaseLeadership()).toBe(true);
    expect(await redis.get(KEY)).toBeNull();
  });

  it("reports no leadership when the lease has lapsed", async () => {
    await acquireLeadership();
    await redis.del(KEY);

    expect(await renewLeadership()).toBe(false);
  });
});
