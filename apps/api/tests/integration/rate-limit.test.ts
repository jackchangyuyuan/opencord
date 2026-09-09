import { randomUUID } from "node:crypto";

import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { type Account, signUp } from "../helpers/accounts.js";

const namespace = vi.hoisted(() => {
  const value = `rl-message-${Math.random().toString(36).slice(2)}`;

  process.env["RATE_LIMIT_NAMESPACE"] = value;
  process.env["RATE_LIMIT_MESSAGE_POINTS"] = "5";

  return value;
});

const { app } = await import("../../src/app.js");
const { db } = await import("../../src/db/index.js");
const { redis } = await import("../../src/redis.js");
const { serverMembers } = await import("../../src/db/schema/index.js");
const { MESSAGE_WINDOW_SECONDS } =
  await import("../../src/middleware/rate-limit.js");
const { requireTestDatabase } = await import("../setup.js");

const serverBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string(), name: z.string() }));

async function seed(): Promise<{
  ada: Account;
  grace: Account;
  channelId: string;
}> {
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

function send(account: Account, channelId: string, content: string) {
  return request(app)
    .post(`/api/v1/channels/${channelId}/messages`)
    .set("Cookie", account.cookies)
    .send({ content, nonce: randomUUID() });
}

function counterFor(userId: string): Promise<string | null> {
  return redis.get(`${namespace}:message:${userId}`);
}

describe("the message-send bucket", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("rejects the sixth send inside the window and counts it in Redis", async () => {
    const fixture = await seed();

    for (let index = 0; index < 5; index += 1) {
      const res = await send(
        fixture.ada,
        fixture.channelId,
        `message ${String(index)}`,
      );

      expect(res.status).toBe(201);
    }

    const rejected = await send(fixture.ada, fixture.channelId, "one too many");

    expect(rejected.status).toBe(429);
    expect(rejected.body).toMatchObject({
      error: { code: "RATE_LIMITED", details: { bucket: "message" } },
    });
    expect(rejected.get("retry-after")).toBe("5");
    expect(await counterFor(fixture.ada.id)).toBe("6");
  });

  it("counts down retry-after as the window runs out", async () => {
    const fixture = await seed();

    for (let index = 0; index < 6; index += 1) {
      await send(fixture.ada, fixture.channelId, `m ${String(index)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));

    const rejected = await send(
      fixture.ada,
      fixture.channelId,
      "still limited",
    );

    expect(rejected.status).toBe(429);

    const retryAfter = Number(rejected.get("retry-after"));

    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThan(MESSAGE_WINDOW_SECONDS);
  });

  it("meters each user separately", async () => {
    const fixture = await seed();

    for (let index = 0; index < 6; index += 1) {
      await send(fixture.ada, fixture.channelId, `m ${String(index)}`);
    }

    expect((await send(fixture.grace, fixture.channelId, "mine")).status).toBe(
      201,
    );
    expect(await counterFor(fixture.ada.id)).toBe("6");
    expect(await counterFor(fixture.grace.id)).toBe("1");
  });

  it("counts nothing for a request rejected before the limiter", async () => {
    const fixture = await seed();
    const stranger = await signUp("hopper");

    const res = await send(stranger, fixture.channelId, "not a member");

    expect(res.status).toBe(403);
    expect(await counterFor(stranger.id)).toBeNull();
  });

  it("counts nothing for a request that fails validation", async () => {
    const fixture = await seed();

    const res = await request(app)
      .post(`/api/v1/channels/${fixture.channelId}/messages`)
      .set("Cookie", fixture.ada.cookies)
      .send({ content: "   ", nonce: randomUUID() });

    expect(res.status).toBe(400);
    expect(await counterFor(fixture.ada.id)).toBeNull();
  });
});
