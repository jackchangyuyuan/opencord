import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { count, eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  channels,
  guestQuotas,
  messages,
  serverMembers,
  servers,
} from "../../src/db/schema/index.js";
import { seedCommunity } from "../../src/db/seed/community.js";
import { seedSandboxTemplate } from "../../src/db/seed/sandbox.js";
import * as demoQueries from "../../src/modules/demo/queries.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const scenarioBody = z.object({
  userId: z.string(),
  serverCount: z.number(),
  sandboxId: z.string(),
  landingChannelId: z.string().nullable(),
});
const serverList = z.array(z.object({ id: z.string(), name: z.string() }));
const channelList = z.array(z.object({ id: z.string(), name: z.string() }));
const userBody = z.object({ user: z.object({ id: z.string() }) });

interface Account {
  id: string;
  cookies: string[];
}

async function enterDemo(): Promise<{
  account: Account;
  scenario: z.infer<typeof scenarioBody>;
}> {
  const res = await request(app).post("/api/v1/demo/guest").send({});

  expect(res.status).toBe(201);

  const scenario = scenarioBody.parse(res.body);

  return {
    account: { id: scenario.userId, cookies: res.get("Set-Cookie") ?? [] },
    scenario,
  };
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
    id: userBody.parse(res.body).user.id,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

async function seedWorld(): Promise<void> {
  const community = await seedCommunity(400);

  await seedSandboxTemplate(community.people);
}

function openDm(account: Account, recipientId: string) {
  return request(app)
    .post("/api/v1/dms")
    .set("Cookie", account.cookies)
    .send({ recipientId });
}

describe("guest demo provisioning", () => {
  beforeAll(requireTestDatabase);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lands the visitor in a world that is already alive", async () => {
    await seedWorld();

    const { account, scenario } = await enterDemo();

    expect(scenario.serverCount).toBe(3);

    const listed = await request(app)
      .get("/api/v1/servers")
      .set("Cookie", account.cookies);

    const visible = serverList.parse(listed.body);

    expect(visible).toHaveLength(3);
    expect(visible.map((server) => server.name)).toContain("Your sandbox");

    const sandbox = await db.query.servers.findFirst({
      columns: { ownerId: true, isDemoSandbox: true },
      where: { id: scenario.sandboxId },
    });

    expect(sandbox).toEqual({ ownerId: account.id, isDemoSandbox: true });

    const quota = await db
      .select({ value: count() })
      .from(guestQuotas)
      .where(eq(guestQuotas.userId, account.id));

    expect(quota[0]?.value).toBe(1);

    const sandboxChannels = await request(app)
      .get(`/api/v1/servers/${scenario.sandboxId}/channels`)
      .set("Cookie", account.cookies);

    const cloned = channelList.parse(sandboxChannels.body);

    expect(cloned.map((channel) => channel.name)).toEqual([
      "general",
      "ideas",
      "staff-only",
    ]);

    const [populated] = await db
      .select({ value: count() })
      .from(messages)
      .innerJoin(channels, eq(channels.id, messages.channelId))
      .where(eq(channels.serverId, scenario.sandboxId));

    expect(populated?.value).toBeGreaterThan(0);

    const landing = scenario.landingChannelId ?? "";

    const history = await request(app)
      .get(`/api/v1/channels/${landing}/messages`)
      .set("Cookie", account.cookies);

    expect(history.status).toBe(200);
    expect(
      z.object({ data: z.array(z.unknown()) }).parse(history.body).data.length,
    ).toBeGreaterThan(0);
  });

  it("shows the community private channel to nobody who joins", async () => {
    await seedWorld();

    const { account } = await enterDemo();

    const listed = await request(app)
      .get("/api/v1/servers")
      .set("Cookie", account.cookies);

    const hq = serverList
      .parse(listed.body)
      .find((server) => server.name === "OpenCord HQ");

    const visible = await request(app)
      .get(`/api/v1/servers/${hq?.id ?? ""}/channels`)
      .set("Cookie", account.cookies);

    expect(
      channelList.parse(visible.body).map((channel) => channel.name),
    ).not.toContain("core-team");
  });

  it("leaves an expiring account behind when provisioning fails", async () => {
    await seedWorld();

    vi.spyOn(demoQueries, "cloneSandbox").mockRejectedValue(
      new Error("the clone failed"),
    );

    const res = await request(app).post("/api/v1/demo/guest").send({});

    expect(res.status).toBe(500);

    const orphan = await db.query.users.findFirst({
      columns: { id: true, isAnonymous: true, guestExpiresAt: true },
      where: { isAnonymous: true },
    });

    expect(orphan?.isAnonymous).toBe(true);
    expect(orphan?.guestExpiresAt).not.toBeNull();

    const memberships = await db
      .select({ value: count() })
      .from(serverMembers)
      .where(eq(serverMembers.userId, orphan?.id ?? ""));

    expect(memberships[0]?.value).toBe(0);
  });

  it("behaves identically whether or not the sandbox flag is set", async () => {
    await seedWorld();

    const { account, scenario } = await enterDemo();

    const first = await request(app)
      .post(`/api/v1/servers/${scenario.sandboxId}/channels`)
      .set("Cookie", account.cookies)
      .send({ type: "text", name: "flagged" });

    await db
      .update(servers)
      .set({ isDemoSandbox: false })
      .where(eq(servers.id, scenario.sandboxId));

    const second = await request(app)
      .post(`/api/v1/servers/${scenario.sandboxId}/channels`)
      .set("Cookie", account.cookies)
      .send({ type: "text", name: "unflagged" });

    expect(second.status).toBe(first.status);

    const deleted = await request(app)
      .delete(`/api/v1/servers/${scenario.sandboxId}`)
      .set("Cookie", account.cookies);

    expect(deleted.status).toBe(204);
  });

  it("reads is_demo_sandbox nowhere inside an authorization path", () => {
    const roots = ["src/modules", "src/access"];
    const offenders: string[] = [];

    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);

        if (entry.isDirectory()) {
          walk(path);
          continue;
        }

        if (!entry.name.endsWith(".ts")) {
          continue;
        }

        const source = readFileSync(path, "utf8");

        if (
          /isDemoSandbox|is_demo_sandbox/.test(source) &&
          !path.endsWith(join("demo", "queries.ts"))
        ) {
          offenders.push(path);
        }
      }
    };

    for (const root of roots) {
      walk(root);
    }

    expect(offenders).toEqual([]);
  });

  it("scopes a guest's new conversations to people it can already see", async () => {
    await seedWorld();

    const { account: guest } = await enterDemo();
    const stranger = await signUp("stranger");

    const refused = await openDm(guest, stranger.id);

    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({
      error: { code: "DM_NOT_PERMITTED" },
    });

    const peer = await db.query.users.findFirst({
      columns: { id: true },
      where: { username: { like: "seed-%" } },
    });

    const allowed = await openDm(guest, peer?.id ?? "");

    expect(allowed.status).toBe(201);

    const channelId = z.object({ id: z.string() }).parse(allowed.body).id;

    const sent = await request(app)
      .post(`/api/v1/channels/${channelId}/messages`)
      .set("Cookie", guest.cookies)
      .send({ content: "hello", nonce: randomUUID() });

    expect(sent.status).toBe(201);
  });

  it("lets a registered caller open either conversation", async () => {
    await seedWorld();

    const ada = await signUp("ada");
    const grace = await signUp("grace");

    expect((await openDm(ada, grace.id)).status).toBe(201);

    const peer = await db.query.users.findFirst({
      columns: { id: true },
      where: { username: { like: "seed-%" } },
    });

    expect((await openDm(ada, peer?.id ?? "")).status).toBe(201);
  });
});
