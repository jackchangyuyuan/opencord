import { randomUUID } from "node:crypto";

import { Permissions } from "@opencord/shared/permissions";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { config } from "../../src/config.js";
import { db } from "../../src/db/index.js";
import {
  channelRoleOverwrites,
  roles,
  serverMembers,
} from "../../src/db/schema/index.js";
import * as storage from "../../src/lib/storage.js";
import { signMediaUrl } from "../../src/lib/storage.js";
import { type Account, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

const serverBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string(), name: z.string() }));
const messageBody = z.object({
  id: z.string(),
  attachments: z.array(
    z.object({ id: z.string(), url: z.string(), objectKey: z.string() }),
  ),
});
const messagePage = z.object({ data: z.array(messageBody) });

interface Fixture {
  ada: Account;
  grace: Account;
  serverId: string;
  general: string;
  everyoneRoleId: string;
}

async function seed(): Promise<Fixture> {
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

  const [general] = channelList.parse(listed.body);
  const everyone = await db.query.roles.findFirst({
    columns: { id: true },
    where: { serverId, isDefault: true },
  });

  if (general === undefined || everyone === undefined) {
    throw new Error("the fixture is incomplete");
  }

  return {
    ada,
    grace,
    serverId,
    general: general.id,
    everyoneRoleId: everyone.id,
  };
}

function stubHead() {
  vi.spyOn(storage, "headObject").mockResolvedValue({
    contentType: "image/png",
    size: 2048,
    lastModified: new Date(),
  });

  vi.spyOn(storage, "copyObject").mockResolvedValue();
}

async function attach(account: Account, channelId: string): Promise<string> {
  const res = await request(app)
    .post(`/api/v1/channels/${channelId}/messages`)
    .set("Cookie", account.cookies)
    .send({
      content: "see this",
      nonce: randomUUID(),
      attachments: [
        {
          objectKey: `attachments/${account.id}/${randomUUID()}.png`,
          filename: "shot.png",
        },
      ],
    });

  expect(res.status).toBe(201);

  return messageBody.parse(res.body).id;
}

function history(account: Account, channelId: string) {
  return request(app)
    .get(`/api/v1/channels/${channelId}/messages`)
    .set("Cookie", account.cookies);
}

function media(account: Account, url: string) {
  return request(app).get(url).set("Cookie", account.cookies).redirects(0);
}

async function firstAttachment(
  account: Account,
  channelId: string,
): Promise<{ id: string; url: string }> {
  const page = messagePage.parse((await history(account, channelId)).body);
  const file = page.data[0]?.attachments[0];

  if (file === undefined) {
    throw new Error("the fixture is incomplete");
  }

  return file;
}

describe("media URLs", () => {
  beforeAll(requireTestDatabase);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("gives a public channel the long-lived, cacheable directive", async () => {
    const fixture = await seed();

    stubHead();
    await attach(fixture.ada, fixture.general);

    const file = await firstAttachment(fixture.grace, fixture.general);
    const res = await media(fixture.grace, file.url);

    expect(res.status).toBe(302);
    expect(res.headers["location"]).toContain(
      encodeURIComponent(`max-age=${String(config.MEDIA_URL_TTL_PUBLIC)}`),
    );
    expect(res.headers["location"]).toContain(
      `X-Amz-Expires=${String(
        config.MEDIA_URL_TTL_PUBLIC + config.MEDIA_URL_SIGNING_BUCKET,
      )}`,
    );

    expect(res.headers["cache-control"]).toBe(
      `private, max-age=${String(config.MEDIA_URL_SIGNING_BUCKET)}`,
    );
  });

  it("carries a URL that does not expire and is re-signed on each request", async () => {
    const fixture = await seed();

    stubHead();
    await attach(fixture.ada, fixture.general);

    await db
      .update(roles)
      .set({ permissions: Permissions.SEND_MESSAGES })
      .where(eq(roles.id, fixture.everyoneRoleId));

    const first = await firstAttachment(fixture.ada, fixture.general);

    expect(first.url).toBe(
      `/api/v1/channels/${fixture.general}/attachments/${first.id}`,
    );
    expect(first.url).not.toContain("X-Amz-Signature");

    const early = await media(fixture.ada, first.url);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(
      new Date(Date.now() + (config.MEDIA_URL_TTL_PRIVATE + 60) * 1000),
    );

    const late = await media(fixture.ada, first.url);

    vi.useRealTimers();

    expect((await firstAttachment(fixture.ada, fixture.general)).url).toBe(
      first.url,
    );
    expect(early.status).toBe(302);
    expect(late.status).toBe(302);
    expect(late.headers["location"]).not.toBe(early.headers["location"]);
  });

  it("refuses the media of a channel the caller cannot read", async () => {
    const fixture = await seed();

    stubHead();
    await attach(fixture.ada, fixture.general);

    const file = await firstAttachment(fixture.ada, fixture.general);
    const outsider = await signUp("hopper");

    expect((await media(outsider, file.url)).status).toBe(403);
  });

  it("treats a channel @everyone cannot see as private with no overwrite at all", async () => {
    const fixture = await seed();

    await db
      .update(roles)
      .set({ permissions: Permissions.SEND_MESSAGES })
      .where(eq(roles.id, fixture.everyoneRoleId));

    const overwrites = await db
      .select({ channelId: channelRoleOverwrites.channelId })
      .from(channelRoleOverwrites)
      .where(eq(channelRoleOverwrites.channelId, fixture.general));

    expect(overwrites).toHaveLength(0);

    stubHead();
    await attach(fixture.ada, fixture.general);

    const file = await firstAttachment(fixture.ada, fixture.general);
    const res = await media(fixture.ada, file.url);

    expect(res.headers["location"]).toContain(encodeURIComponent("no-store"));
    expect(res.headers["location"]).toContain(
      `X-Amz-Expires=${String(config.MEDIA_URL_TTL_PRIVATE)}`,
    );
    expect(res.headers["location"]).not.toContain("max-age");
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });

  it("treats a direct message as private", async () => {
    const fixture = await seed();

    const opened = await request(app)
      .post("/api/v1/dms")
      .set("Cookie", fixture.ada.cookies)
      .send({ recipientId: fixture.grace.id });

    const channelId = z.object({ id: z.string() }).parse(opened.body).id;

    stubHead();
    await attach(fixture.ada, channelId);

    const file = await firstAttachment(fixture.grace, channelId);

    expect(
      (await media(fixture.grace, file.url)).headers["location"],
    ).toContain(encodeURIComponent("no-store"));
  });

  it("stops issuing URLs the moment the channel stops being visible", async () => {
    const fixture = await seed();

    stubHead();
    await attach(fixture.ada, fixture.general);

    expect(
      messagePage.parse((await history(fixture.grace, fixture.general)).body)
        .data[0]?.attachments,
    ).toHaveLength(1);

    await db.insert(channelRoleOverwrites).values({
      channelId: fixture.general,
      serverId: fixture.serverId,
      roleId: fixture.everyoneRoleId,
      allow: 0,
      deny: Permissions.VIEW_CHANNEL,
    });

    const revoked = await history(fixture.grace, fixture.general);

    expect(revoked.status).toBe(404);

    const stillThere = await db
      .select({ channelId: channelRoleOverwrites.channelId })
      .from(channelRoleOverwrites)
      .where(
        and(
          eq(channelRoleOverwrites.channelId, fixture.general),
          eq(channelRoleOverwrites.roleId, fixture.everyoneRoleId),
        ),
      );

    expect(stillThere).toHaveLength(1);
  });

  it("signs identically inside one bucket and differently across buckets", async () => {
    const key = `attachments/ada/${randomUUID()}.png`;
    const width = config.MEDIA_URL_SIGNING_BUCKET * 1000;
    const start = Math.floor(Date.now() / width) * width;

    vi.spyOn(Date, "now").mockReturnValue(start + 1);
    const early = await signMediaUrl(key, "cacheable");

    vi.spyOn(Date, "now").mockReturnValue(start + width - 1);
    const late = await signMediaUrl(key, "cacheable");

    vi.spyOn(Date, "now").mockReturnValue(start + width);
    const next = await signMediaUrl(key, "cacheable");

    expect(late).toBe(early);
    expect(next).not.toBe(early);
  });
});
