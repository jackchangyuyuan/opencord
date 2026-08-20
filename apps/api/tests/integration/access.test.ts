import { Permissions } from "@opencord/shared/permissions";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { resolveAccessibleChannels } from "../../src/access/channels.js";
import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  channelMemberOverwrites,
  channelRoleOverwrites,
  memberRoles,
  roles,
  serverMembers,
} from "../../src/db/schema/index.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const serverBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string(), name: z.string() }));

interface Account {
  id: string;
  cookies: string[];
}

interface Fixture {
  ada: Account;
  grace: Account;
  serverId: string;
  everyoneRoleId: string;
  general: string;
  random: string;
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
    id: signUpBody.parse(res.body).user.id,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

async function createServer(account: Account, name: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", account.cookies)
    .send({ name });

  expect(res.status).toBe(201);

  return serverBody.parse(res.body).id;
}

function listChannels(account: Account, serverId: string) {
  return request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", account.cookies);
}

async function seed(): Promise<Fixture> {
  const ada = await signUp("ada");
  const grace = await signUp("grace");
  const serverId = await createServer(ada, "Analytical Engine");

  await db.insert(serverMembers).values({ serverId, userId: grace.id });

  const channels = channelList.parse((await listChannels(ada, serverId)).body);
  const general = channels.find((channel) => channel.name === "general");
  const random = channels.find((channel) => channel.name === "random");
  const everyone = await db.query.roles.findFirst({
    columns: { id: true },
    where: { serverId, isDefault: true },
  });

  if (general === undefined || random === undefined || everyone === undefined) {
    throw new Error("the fixture is incomplete");
  }

  return {
    ada,
    grace,
    serverId,
    everyoneRoleId: everyone.id,
    general: general.id,
    random: random.id,
  };
}

describe("resolveAccessibleChannels", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("is empty for a user who has joined nothing", async () => {
    const ada = await signUp("ada");

    expect(await resolveAccessibleChannels(ada.id)).toEqual(new Set());
  });

  it("returns every channel of every server the user belongs to", async () => {
    const fixture = await seed();

    expect(await resolveAccessibleChannels(fixture.grace.id)).toEqual(
      new Set([fixture.general, fixture.random]),
    );
  });

  it("drops a channel denied VIEW_CHANNEL through the @everyone overwrite", async () => {
    const fixture = await seed();

    await db.insert(channelRoleOverwrites).values({
      channelId: fixture.general,
      serverId: fixture.serverId,
      roleId: fixture.everyoneRoleId,
      deny: Permissions.VIEW_CHANNEL,
    });

    expect(await resolveAccessibleChannels(fixture.grace.id)).toEqual(
      new Set([fixture.random]),
    );
  });

  it("keeps every channel for the owner, whatever the overwrites say", async () => {
    const fixture = await seed();

    await db.insert(channelRoleOverwrites).values({
      channelId: fixture.general,
      serverId: fixture.serverId,
      roleId: fixture.everyoneRoleId,
      deny: Permissions.VIEW_CHANNEL,
    });

    expect(await resolveAccessibleChannels(fixture.ada.id)).toEqual(
      new Set([fixture.general, fixture.random]),
    );
  });

  it("drops every channel when @everyone never granted VIEW_CHANNEL", async () => {
    const fixture = await seed();

    await db
      .update(roles)
      .set({ permissions: Permissions.SEND_MESSAGES })
      .where(eq(roles.id, fixture.everyoneRoleId));

    expect(await resolveAccessibleChannels(fixture.grace.id)).toEqual(
      new Set(),
    );
    expect(await db.select().from(channelRoleOverwrites)).toEqual([]);
  });

  it("lets a member overwrite restore a channel the role layer denied", async () => {
    const fixture = await seed();

    await db.insert(channelRoleOverwrites).values({
      channelId: fixture.general,
      serverId: fixture.serverId,
      roleId: fixture.everyoneRoleId,
      deny: Permissions.VIEW_CHANNEL,
    });
    await db.insert(channelMemberOverwrites).values({
      channelId: fixture.general,
      serverId: fixture.serverId,
      userId: fixture.grace.id,
      allow: Permissions.VIEW_CHANNEL,
    });

    expect(await resolveAccessibleChannels(fixture.grace.id)).toEqual(
      new Set([fixture.general, fixture.random]),
    );
  });

  it("reads a granting overwrite only for the roles the member holds", async () => {
    const fixture = await seed();

    await db
      .update(roles)
      .set({ permissions: 0 })
      .where(eq(roles.id, fixture.everyoneRoleId));

    const [role] = await db
      .insert(roles)
      .values({ serverId: fixture.serverId, name: "staff", position: 1 })
      .returning({ id: roles.id });

    const roleId = role?.id ?? "";

    await db.insert(channelRoleOverwrites).values({
      channelId: fixture.general,
      serverId: fixture.serverId,
      roleId,
      allow: Permissions.VIEW_CHANNEL,
    });

    expect(await resolveAccessibleChannels(fixture.grace.id)).toEqual(
      new Set(),
    );

    await db.insert(memberRoles).values({
      serverId: fixture.serverId,
      userId: fixture.grace.id,
      roleId,
    });

    expect(await resolveAccessibleChannels(fixture.grace.id)).toEqual(
      new Set([fixture.general]),
    );
  });

  it("skips a server that has lost its @everyone role", async () => {
    const fixture = await seed();

    await db
      .delete(roles)
      .where(
        and(eq(roles.serverId, fixture.serverId), eq(roles.isDefault, true)),
      );

    expect(await resolveAccessibleChannels(fixture.grace.id)).toEqual(
      new Set(),
    );
  });

  it("spans every server the user belongs to", async () => {
    const fixture = await seed();
    const other = await createServer(fixture.grace, "Difference Engine");

    const accessible = await resolveAccessibleChannels(fixture.grace.id);

    expect(accessible.size).toBe(4);
    expect(accessible.has(fixture.general)).toBe(true);

    const otherChannels = channelList.parse(
      (await listChannels(fixture.grace, other)).body,
    );

    for (const channel of otherChannels) {
      expect(accessible.has(channel.id)).toBe(true);
    }
  });
});

describe("the channel list is the resolver's first consumer", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("omits a denied channel from the payload entirely", async () => {
    const fixture = await seed();

    await db.insert(channelRoleOverwrites).values({
      channelId: fixture.general,
      serverId: fixture.serverId,
      roleId: fixture.everyoneRoleId,
      deny: Permissions.VIEW_CHANNEL,
    });

    const res = await listChannels(fixture.grace, fixture.serverId);

    expect(res.status).toBe(200);
    expect(channelList.parse(res.body).map((channel) => channel.name)).toEqual([
      "random",
    ]);
  });

  it("answers 404 rather than 403 for a channel the caller cannot view", async () => {
    const fixture = await seed();

    await db.insert(channelRoleOverwrites).values({
      channelId: fixture.general,
      serverId: fixture.serverId,
      roleId: fixture.everyoneRoleId,
      deny: Permissions.VIEW_CHANNEL,
    });

    const res = await request(app)
      .get(`/api/v1/channels/${fixture.general}`)
      .set("Cookie", fixture.grace.cookies);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("hides a channel from a member whose @everyone never granted the bit", async () => {
    const fixture = await seed();

    await db
      .update(roles)
      .set({ permissions: Permissions.SEND_MESSAGES })
      .where(eq(roles.id, fixture.everyoneRoleId));

    expect(
      channelList.parse(
        (await listChannels(fixture.grace, fixture.serverId)).body,
      ),
    ).toEqual([]);

    const res = await request(app)
      .get(`/api/v1/channels/${fixture.general}`)
      .set("Cookie", fixture.grace.cookies);

    expect(res.status).toBe(404);
  });

  it("still shows the owner everything", async () => {
    const fixture = await seed();

    await db
      .update(roles)
      .set({ permissions: 0 })
      .where(eq(roles.id, fixture.everyoneRoleId));

    expect(
      channelList.parse(
        (await listChannels(fixture.ada, fixture.serverId)).body,
      ),
    ).toHaveLength(2);
  });
});
