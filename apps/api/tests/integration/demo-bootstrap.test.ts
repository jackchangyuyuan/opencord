import { count, eq, isNotNull, like } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { channels, servers, users } from "../../src/db/schema/index.js";
import {
  COMMUNITY_SERVER_NAMES,
  SANDBOX_TEMPLATE_NAME,
  SEED_USERNAME_PREFIX,
} from "../../src/modules/demo/dataset.js";
import {
  ensureDemoDataset,
  seedCommunity,
} from "../../src/modules/demo/provision.js";
import { seedSandboxTemplate } from "../../src/modules/demo/sandbox.js";
import { requireTestDatabase } from "../setup.js";

const scenarioBody = z.object({
  userId: z.string(),
  serverCount: z.number(),
  dmCount: z.number(),
  sandboxId: z.string(),
  landingChannelId: z.string().nullable(),
});

const MEMBERS = 12;
const MESSAGES = 60;

async function serverCount(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(servers);

  return row?.value ?? 0;
}

describe("the production bootstrap", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("provisions a demo dataset an empty database can serve from", async () => {
    await expect(ensureDemoDataset(MESSAGES, MEMBERS)).resolves.toBe(true);

    const template = await db.query.servers.findFirst({
      columns: { id: true, name: true },
      where: { demoRole: "template" },
    });

    expect(template?.name).toBe(SANDBOX_TEMPLATE_NAME);

    const community = await db.query.servers.findMany({
      columns: { name: true },
      where: { demoRole: "community" },
    });

    expect(community.map((server) => server.name).sort()).toEqual(
      [...COMMUNITY_SERVER_NAMES].sort(),
    );

    const [cast] = await db
      .select({ value: count() })
      .from(users)
      .where(like(users.username, `${SEED_USERNAME_PREFIX}%`));

    expect(cast?.value).toBe(MEMBERS);
  });

  it("leaves every provisioned channel with a watermark", async () => {
    await ensureDemoDataset(MESSAGES, MEMBERS);

    const [all] = await db.select({ value: count() }).from(channels);
    const [watermarked] = await db
      .select({ value: count() })
      .from(channels)
      .where(isNotNull(channels.lastMessageId));

    expect(all?.value).toBeGreaterThan(0);
    expect(watermarked?.value).toBe(all?.value);
  });

  it("gives the cast portraits from an origin the policy allows", async () => {
    await ensureDemoDataset(MESSAGES, MEMBERS);

    const cast = await db
      .select({ image: users.image })
      .from(users)
      .where(like(users.username, `${SEED_USERNAME_PREFIX}%`));

    const portraits = cast.flatMap((row) =>
      row.image === null ? [] : [row.image],
    );

    expect(portraits).toHaveLength(MEMBERS);

    for (const portrait of portraits) {
      expect(new URL(portrait).origin).toBe("https://cdn.jsdelivr.net");
    }
  });

  it("does nothing the second time and writes no second cast", async () => {
    await expect(ensureDemoDataset(MESSAGES, MEMBERS)).resolves.toBe(true);

    const before = await serverCount();

    await expect(ensureDemoDataset(MESSAGES, MEMBERS)).resolves.toBe(false);
    await expect(ensureDemoDataset(MESSAGES, MEMBERS)).resolves.toBe(false);

    expect(await serverCount()).toBe(before);
  });

  it("answers the landing page's demo entry on a freshly bootstrapped database", async () => {
    await ensureDemoDataset(MESSAGES, MEMBERS);

    const entered = await request(app).post("/api/v1/demo/guest").send();

    expect(entered.status).toBe(201);

    const scenario = scenarioBody.parse(entered.body);

    expect(scenario.serverCount).toBeGreaterThan(0);
    expect(scenario.dmCount).toBeGreaterThan(0);

    const sandbox = await db.query.servers.findFirst({
      columns: { id: true, demoRole: true, isDemoSandbox: true },
      where: { id: scenario.sandboxId },
    });

    expect(sandbox?.isDemoSandbox).toBe(true);
    expect(sandbox?.demoRole).toBeNull();
  });

  it("refuses demo entry when nothing has been provisioned", async () => {
    const entered = await request(app).post("/api/v1/demo/guest").send();

    expect(entered.status).toBe(500);

    await expect(
      db.select({ value: count() }).from(servers).where(eq(servers.name, "x")),
    ).resolves.toEqual([{ value: 0 }]);
  });

  it("refuses to provision from an empty cast", async () => {
    await expect(seedCommunity(MESSAGES, 0)).rejects.toThrow(
      "the persona list is empty",
    );
    await expect(seedSandboxTemplate([])).rejects.toThrow(
      "the persona list is empty",
    );
  });
});
