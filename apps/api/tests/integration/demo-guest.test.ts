import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { count, eq, sql } from "drizzle-orm";
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
  users,
} from "../../src/db/schema/index.js";
import { seedCommunity } from "../../src/db/seed/community.js";
import { seedSandboxTemplate } from "../../src/db/seed/sandbox.js";
import { SEED_USERNAME_PREFIX } from "../../src/modules/demo/dataset.js";
import { demoPresenceStatusAt } from "../../src/modules/demo/presence.js";
import * as demoQueries from "../../src/modules/demo/queries.js";
import { DM_THREAD_COUNT, DM_THREADS } from "../../src/modules/demo/threads.js";
import { type Account, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

const scenarioBody = z.object({
  userId: z.string(),
  serverCount: z.number(),
  dmCount: z.number(),
  sandboxId: z.string(),
  landingChannelId: z.string().nullable(),
});
const dmList = z.array(
  z.object({
    id: z.string(),
    lastMessageId: z.string().nullable(),
    hasUnread: z.boolean(),
    recipient: z.object({
      id: z.string(),
      username: z.string(),
      name: z.string(),
    }),
  }),
);
const participantList = z.array(
  z.object({ id: z.string(), username: z.string() }),
);
const messagePage = z.object({
  data: z.array(z.object({ id: z.string(), authorId: z.string() })),
});
const serverList = z.array(z.object({ id: z.string(), name: z.string() }));
const channelList = z.array(z.object({ id: z.string(), name: z.string() }));
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

  it("joins the visitor to no server that merely took a seeded name", async () => {
    await seedWorld();

    const [outsider] = await db
      .insert(users)
      .values({
        id: `outsider-${randomUUID().slice(0, 8)}`,
        name: "outsider",
        username: `outsider${randomUUID().slice(0, 8)}`,
        email: `outsider-${randomUUID().slice(0, 8)}@example.com`,
        emailVerified: false,
      })
      .returning({ id: users.id });

    const impostors = await db
      .insert(servers)
      .values(
        ["OpenCord HQ", "The Lounge", "Sandbox template"].map((name) => ({
          name,
          ownerId: outsider?.id ?? "",
        })),
      )
      .returning({ id: servers.id });

    const { account } = await enterDemo();

    const joined = await db
      .select({ serverId: serverMembers.serverId })
      .from(serverMembers)
      .where(eq(serverMembers.userId, account.id));

    const impostorIds = new Set(impostors.map((server) => server.id));

    expect(joined.filter((row) => impostorIds.has(row.serverId))).toEqual([]);
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

  it("hands the visitor conversations they can open immediately", async () => {
    await seedWorld();

    const { account, scenario } = await enterDemo();

    expect(scenario.dmCount).toBe(DM_THREAD_COUNT);

    const listed = await request(app)
      .get("/api/v1/dms")
      .set("Cookie", account.cookies);

    expect(listed.status).toBe(200);

    const dms = dmList.parse(listed.body);

    expect(dms).toHaveLength(DM_THREAD_COUNT);
    expect(new Set(dms.map((dm) => dm.recipient.id)).size).toBe(
      DM_THREAD_COUNT,
    );

    for (const dm of dms) {
      expect(dm.lastMessageId).not.toBeNull();
      expect(dm.recipient.username.startsWith(SEED_USERNAME_PREFIX)).toBe(true);
    }

    expect(dms.map((dm) => dm.lastMessageId)).toEqual(
      dms
        .map((dm) => dm.lastMessageId)
        .toSorted((a, b) => ((a ?? "") < (b ?? "") ? 1 : -1)),
    );
  });

  it("writes both sides of every seeded conversation", async () => {
    await seedWorld();

    const { account } = await enterDemo();

    const dms = dmList.parse(
      (await request(app).get("/api/v1/dms").set("Cookie", account.cookies))
        .body,
    );

    for (const dm of dms) {
      const history = await request(app)
        .get(`/api/v1/channels/${dm.id}/messages`)
        .set("Cookie", account.cookies);

      expect(history.status).toBe(200);

      const authors = new Set(
        messagePage.parse(history.body).data.map((row) => row.authorId),
      );

      expect(authors).toEqual(new Set([account.id, dm.recipient.id]));
    }
  });

  it("records both participants in the conversation membership", async () => {
    await seedWorld();

    const { account } = await enterDemo();

    const [dm] = dmList.parse(
      (await request(app).get("/api/v1/dms").set("Cookie", account.cookies))
        .body,
    );

    const participants = await request(app)
      .get(`/api/v1/channels/${dm?.id ?? ""}/members`)
      .set("Cookie", account.cookies);

    expect(participants.status).toBe(200);
    expect(
      participantList
        .parse(participants.body)
        .map((row) => row.id)
        .toSorted(),
    ).toEqual([account.id, dm?.recipient.id ?? ""].toSorted());
  });

  it("arrives with some conversations unread and some already read", async () => {
    await seedWorld();

    const { account } = await enterDemo();

    const dms = dmList.parse(
      (await request(app).get("/api/v1/dms").set("Cookie", account.cookies))
        .body,
    );

    expect(dms.filter((dm) => dm.hasUnread).length).toBeGreaterThan(0);
    expect(dms.filter((dm) => !dm.hasUnread).length).toBeGreaterThan(0);
  });

  it("spreads the counterparts across the presence states the demo shows", () => {
    const statuses = new Set(
      DM_THREADS.map((thread) =>
        demoPresenceStatusAt(thread.counterpartOffset),
      ),
    );

    expect(statuses).toEqual(new Set(["online", "idle", "dnd", "offline"]));
  });

  it("uses the real message model rather than a seed-only one", async () => {
    await seedWorld();

    const { account } = await enterDemo();

    const [dm] = dmList.parse(
      (await request(app).get("/api/v1/dms").set("Cookie", account.cookies))
        .body,
    );

    const channelId = dm?.id ?? "";

    const history = messagePage.parse(
      (
        await request(app)
          .get(`/api/v1/channels/${channelId}/messages`)
          .set("Cookie", account.cookies)
      ).body,
    );

    const messageId = history.data[0]?.id ?? "";

    const reacted = await request(app)
      .put(
        `/api/v1/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent("👍")}`,
      )
      .set("Cookie", account.cookies);

    expect(reacted.status).toBe(204);

    const pinned = await request(app)
      .put(`/api/v1/channels/${channelId}/messages/${messageId}/pin`)
      .set("Cookie", account.cookies);

    expect(pinned.status).toBe(200);
  });

  it("orders every seeded message id with its timestamp", async () => {
    await seedWorld();

    const { account } = await enterDemo();

    const [out] = await db.execute<{ value: number }>(sql`
      select count(*)::int as value
        from (
          select m.id, lag(m.id) over (
                   partition by m.channel_id order by m.created_at
                 ) as previous
            from messages m
            join channels c on c.id = m.channel_id
           where c.type = 'dm'
        ) ordered
       where ordered.id < ordered.previous
    `);

    expect(out?.value).toBe(0);
    expect(account.id).toBeTruthy();
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
      orderBy: { id: "desc" },
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
      orderBy: { id: "desc" },
    });

    expect((await openDm(ada, peer?.id ?? "")).status).toBe(201);
  });
});
