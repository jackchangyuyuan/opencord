import { randomUUID } from "node:crypto";

import { Permissions } from "@opencord/shared/permissions";
import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { channels, serverMembers } from "../../src/db/schema/index.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const idBody = z.object({ id: z.string() });
const channelList = z.array(
  z.object({ id: z.string(), name: z.string().nullable() }),
);
const reorderBody = z.object({ channels: channelList });

interface Account {
  id: string;
  cookies: string[];
}

async function signUp(prefix: string): Promise<Account> {
  const username = `${prefix}${randomUUID().replaceAll("-", "").slice(0, 8)}`;

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

interface Fixture {
  owner: Account;
  member: Account;
  serverId: string;
  channelIds: string[];
}

async function seed(): Promise<Fixture> {
  const owner = await signUp("owner");
  const member = await signUp("member");

  const created = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", owner.cookies)
    .send({ name: `Reorder ${randomUUID().slice(0, 8)}` });

  expect(created.status).toBe(201);

  const serverId = idBody.parse(created.body).id;

  await db.insert(serverMembers).values({ serverId, userId: member.id });

  for (const name of ["third", "fourth"]) {
    const res = await request(app)
      .post(`/api/v1/servers/${serverId}/channels`)
      .set("Cookie", owner.cookies)
      .send({ type: "text", name });

    expect(res.status).toBe(201);
  }

  return { owner, member, serverId, channelIds: await order(serverId, owner) };
}

async function order(serverId: string, account: Account): Promise<string[]> {
  const res = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", account.cookies);

  expect(res.status).toBe(200);

  return channelList.parse(res.body).map((channel) => channel.id);
}

function reorder(
  serverId: string,
  account: Account,
  channelIds: readonly string[],
) {
  return request(app)
    .patch(`/api/v1/servers/${serverId}/channels/positions`)
    .set("Cookie", account.cookies)
    .send({ channelIds });
}

function positions(serverId: string): Promise<number[]> {
  return db
    .select({ position: channels.position })
    .from(channels)
    .where(eq(channels.serverId, serverId))
    .orderBy(channels.position)
    .then((rows) => rows.map((row) => row.position));
}

function four(ids: readonly string[]): [string, string, string, string] {
  const [a, b, c, d] = ids;

  if (
    a === undefined ||
    b === undefined ||
    c === undefined ||
    d === undefined
  ) {
    throw new Error(`the fixture has ${String(ids.length)} channels, not four`);
  }

  return [a, b, c, d];
}

const HIDDEN_CHANNEL_NAME = "boardroom-only";
const HIDDEN_CHANNEL_TOPIC = "quarterly numbers, not for the floor";

async function hideOneChannelFromTheMember(
  fixture: Fixture,
): Promise<{ hidden: string; topic: string }> {
  const promoted = await request(app)
    .post(`/api/v1/servers/${fixture.serverId}/roles`)
    .set("Cookie", fixture.owner.cookies)
    .send({
      name: "Manager",
      permissions: Permissions.VIEW_CHANNEL | Permissions.MANAGE_CHANNELS,
    });

  expect(promoted.status).toBe(201);

  const roleId = idBody.parse(promoted.body).id;

  const assigned = await request(app)
    .put(
      `/api/v1/servers/${fixture.serverId}/members/${fixture.member.id}/roles/${roleId}`,
    )
    .set("Cookie", fixture.owner.cookies)
    .send({});

  expect(assigned.status).toBeLessThan(300);

  const [, hidden] = four(fixture.channelIds);

  const described = await request(app)
    .patch(`/api/v1/channels/${hidden}`)
    .set("Cookie", fixture.owner.cookies)
    .send({ name: HIDDEN_CHANNEL_NAME, topic: HIDDEN_CHANNEL_TOPIC });

  expect(described.status).toBe(200);

  const everyone = await request(app)
    .get(`/api/v1/servers/${fixture.serverId}/roles`)
    .set("Cookie", fixture.owner.cookies);

  const everyoneRoleId = z
    .array(z.object({ id: z.string(), isDefault: z.boolean() }))
    .parse(everyone.body)
    .find((role) => role.isDefault)?.id;

  if (everyoneRoleId === undefined) {
    throw new Error("the fixture has no @everyone role");
  }

  const denied = await request(app)
    .put(`/api/v1/channels/${hidden}/overwrites/roles/${everyoneRoleId}`)
    .set("Cookie", fixture.owner.cookies)
    .send({ allow: 0, deny: Permissions.VIEW_CHANNEL });

  expect(denied.status).toBeLessThan(300);

  return { hidden, topic: HIDDEN_CHANNEL_TOPIC };
}

describe("PATCH /api/v1/servers/:serverId/channels/positions", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("moves the first channel to the end", async () => {
    const fixture = await seed();
    const [a, b, c, d] = four(fixture.channelIds);
    const next = [b, c, d, a];

    expect((await reorder(fixture.serverId, fixture.owner, next)).status).toBe(
      200,
    );

    await expect(order(fixture.serverId, fixture.owner)).resolves.toEqual(next);
  });

  it("moves the last channel to the front", async () => {
    const fixture = await seed();
    const [a, b, c, d] = four(fixture.channelIds);
    const next = [d, a, b, c];

    expect((await reorder(fixture.serverId, fixture.owner, next)).status).toBe(
      200,
    );

    await expect(order(fixture.serverId, fixture.owner)).resolves.toEqual(next);
  });

  it("swaps two adjacent channels", async () => {
    const fixture = await seed();
    const [a, b, c, d] = four(fixture.channelIds);
    const next = [a, c, b, d];

    expect((await reorder(fixture.serverId, fixture.owner, next)).status).toBe(
      200,
    );

    await expect(order(fixture.serverId, fixture.owner)).resolves.toEqual(next);
  });

  it("applies successive reorders in order, renumbering without gaps", async () => {
    const fixture = await seed();
    const [a, b, c, d] = four(fixture.channelIds);

    await reorder(fixture.serverId, fixture.owner, [b, a, c, d]);
    await reorder(fixture.serverId, fixture.owner, [d, c, b, a]);
    await reorder(fixture.serverId, fixture.owner, [c, d, a, b]);

    await expect(order(fixture.serverId, fixture.owner)).resolves.toEqual([
      c,
      d,
      a,
      b,
    ]);
    await expect(positions(fixture.serverId)).resolves.toEqual([0, 1, 2, 3]);
  });

  it("refuses somebody without the bit to manage channels", async () => {
    const fixture = await seed();
    const reversed = [...fixture.channelIds].reverse();

    expect(
      (await reorder(fixture.serverId, fixture.member, reversed)).status,
    ).toBe(403);

    await expect(order(fixture.serverId, fixture.owner)).resolves.toEqual(
      fixture.channelIds,
    );
  });

  it("refuses a channel that belongs to another server", async () => {
    const fixture = await seed();
    const other = await seed();

    const [foreign] = four(other.channelIds);

    const res = await reorder(fixture.serverId, fixture.owner, [
      ...fixture.channelIds.slice(1),
      foreign,
    ]);

    expect(res.status).toBe(404);
    await expect(order(fixture.serverId, fixture.owner)).resolves.toEqual(
      fixture.channelIds,
    );
  });

  it("refuses an order that names a channel twice", async () => {
    const fixture = await seed();
    const [first] = four(fixture.channelIds);

    const res = await reorder(fixture.serverId, fixture.owner, [first, first]);

    expect(res.status).toBe(400);
  });

  it("leaves a channel the actor cannot see where it was", async () => {
    const fixture = await seed();
    const { hidden } = await hideOneChannelFromTheMember(fixture);

    const visible = await order(fixture.serverId, fixture.member);

    expect(visible).not.toContain(hidden);

    expect(
      (await reorder(fixture.serverId, fixture.member, [...visible].reverse()))
        .status,
    ).toBe(200);

    const after = await order(fixture.serverId, fixture.owner);

    expect(after.indexOf(hidden)).toBe(1);
  });

  it("tells the actor nothing about a channel they cannot see", async () => {
    const fixture = await seed();
    const { hidden, topic } = await hideOneChannelFromTheMember(fixture);

    const visible = await order(fixture.serverId, fixture.member);
    const res = await reorder(
      fixture.serverId,
      fixture.member,
      [...visible].reverse(),
    );

    expect(res.status).toBe(200);

    const answered = reorderBody.parse(res.body).channels;

    expect(answered.map((channel) => channel.id)).toEqual(
      [...visible].reverse(),
    );
    expect(answered.map((channel) => channel.id)).not.toContain(hidden);
    expect(JSON.stringify(res.body)).not.toContain(topic);
    expect(JSON.stringify(res.body)).not.toContain(HIDDEN_CHANNEL_NAME);
  });

  it("answers the owner with every channel, hidden ones included", async () => {
    const fixture = await seed();
    const { hidden } = await hideOneChannelFromTheMember(fixture);

    const res = await reorder(
      fixture.serverId,
      fixture.owner,
      fixture.channelIds,
    );

    expect(res.status).toBe(200);
    expect(
      reorderBody.parse(res.body).channels.map((channel) => channel.id),
    ).toContain(hidden);
  });
});
