import { randomUUID } from "node:crypto";

import { Permissions } from "@opencord/shared/permissions";
import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  memberRoles,
  mentions,
  roles,
  serverMembers,
} from "../../src/db/schema/index.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const idBody = z.object({ id: z.string() });
const messageBody = z.object({ id: z.string(), content: z.string() });
const channelList = z.array(z.object({ id: z.string() }));

interface Account {
  id: string;
  username: string;
  cookies: string[];
}

async function signUp(prefix: string): Promise<Account> {
  const username = `${prefix}${randomUUID().replaceAll("-", "").slice(0, 8)}`;

  const res = await request(app)
    .post("/api/auth/sign-up/email")
    .send({
      email: `${username}@example.com`,
      name: `${prefix} person`,
      password,
      username,
    });

  expect(res.status).toBe(200);

  return {
    id: signUpBody.parse(res.body).user.id,
    username,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

async function send(
  account: Account,
  channelId: string,
  content: string,
): Promise<{ id: string; content: string }> {
  const res = await request(app)
    .post(`/api/v1/channels/${channelId}/messages`)
    .set("Cookie", account.cookies)
    .send({ content, nonce: randomUUID() });

  expect(res.status).toBe(201);

  return messageBody.parse(res.body);
}

function mentionedUserIds(messageId: string): Promise<string[]> {
  return db
    .select({ userId: mentions.userId })
    .from(mentions)
    .where(eq(mentions.messageId, messageId))
    .then((rows) => rows.map((row) => row.userId).sort());
}

interface Fixture {
  owner: Account;
  member: Account;
  outsider: Account;
  serverId: string;
  channelId: string;
  secondChannelId: string;
  roleId: string;
  roleName: string;
}

async function seed(): Promise<Fixture> {
  const owner = await signUp("owner");
  const member = await signUp("member");
  const outsider = await signUp("outsider");

  const created = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", owner.cookies)
    .send({ name: `Mentions ${randomUUID().slice(0, 8)}` });

  expect(created.status).toBe(201);

  const serverId = idBody.parse(created.body).id;

  await db.insert(serverMembers).values({ serverId, userId: member.id });

  const roleName = `Crew${randomUUID().replaceAll("-", "").slice(0, 6)}`;

  const role = await request(app)
    .post(`/api/v1/servers/${serverId}/roles`)
    .set("Cookie", owner.cookies)
    .send({ name: roleName, permissions: Permissions.VIEW_CHANNEL });

  expect(role.status).toBe(201);

  const roleId = idBody.parse(role.body).id;

  const assigned = await request(app)
    .put(`/api/v1/servers/${serverId}/members/${member.id}/roles/${roleId}`)
    .set("Cookie", owner.cookies)
    .send({});

  expect(assigned.status).toBeLessThan(300);

  const listed = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", owner.cookies);

  const channels = channelList.parse(listed.body);
  const [first, second] = channels;

  if (first === undefined || second === undefined) {
    throw new Error("the new server has fewer channels than expected");
  }

  return {
    owner,
    member,
    outsider,
    serverId,
    channelId: first.id,
    secondChannelId: second.id,
    roleId,
    roleName,
  };
}

describe("mentions in a server channel", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("rewrites a handle to the author-stable id and notifies them", async () => {
    const fixture = await seed();

    const sent = await send(
      fixture.owner,
      fixture.channelId,
      `hello @${fixture.member.username}`,
    );

    expect(sent.content).toBe(`hello <@${fixture.member.id}>`);
    await expect(mentionedUserIds(sent.id)).resolves.toEqual([
      fixture.member.id,
    ]);
  });

  it("notifies the members of a mentioned role", async () => {
    const fixture = await seed();

    const sent = await send(
      fixture.owner,
      fixture.channelId,
      `heads up @${fixture.roleName}`,
    );

    expect(sent.content).toBe(`heads up <@&${fixture.roleId}>`);
    await expect(mentionedUserIds(sent.id)).resolves.toEqual([
      fixture.member.id,
    ]);
  });

  it("notifies only the role its marker names when two share a name", async () => {
    const fixture = await seed();
    const second = await signUp("second");

    await db
      .insert(serverMembers)
      .values({ serverId: fixture.serverId, userId: second.id });

    const [twin] = await db
      .insert(roles)
      .values({
        serverId: fixture.serverId,
        name: fixture.roleName,
        permissions: Permissions.VIEW_CHANNEL,
        position: 50,
      })
      .returning({ id: roles.id });

    await db.insert(memberRoles).values({
      serverId: fixture.serverId,
      userId: second.id,
      roleId: twin?.id ?? "",
    });

    const sent = await send(
      fixture.owner,
      fixture.channelId,
      `heads up @${fixture.roleName}`,
    );

    expect(sent.content).toBe(`heads up <@&${twin?.id ?? ""}>`);
    await expect(mentionedUserIds(sent.id)).resolves.toEqual([second.id]);
  });

  it("never notifies the author of their own role mention", async () => {
    const fixture = await seed();

    const sent = await send(
      fixture.member,
      fixture.channelId,
      `@${fixture.roleName} ping`,
    );

    expect(sent.content).toBe(`<@&${fixture.roleId}> ping`);
    await expect(mentionedUserIds(sent.id)).resolves.toEqual([]);
  });

  it("rewrites a channel the author can read", async () => {
    const fixture = await seed();

    const listed = await request(app)
      .get(`/api/v1/servers/${fixture.serverId}/channels`)
      .set("Cookie", fixture.owner.cookies);

    const named = z
      .array(z.object({ id: z.string(), name: z.string().nullable() }))
      .parse(listed.body)
      .find((channel) => channel.id === fixture.secondChannelId);

    const sent = await send(
      fixture.owner,
      fixture.channelId,
      `see #${named?.name ?? ""}`,
    );

    expect(sent.content).toBe(`see <#${fixture.secondChannelId}>`);
  });

  it("leaves a name that resolves to nothing as plain text", async () => {
    const fixture = await seed();

    const sent = await send(
      fixture.owner,
      fixture.channelId,
      "@nobody in #nowhere",
    );

    expect(sent.content).toBe("@nobody in #nowhere");
    await expect(mentionedUserIds(sent.id)).resolves.toEqual([]);
  });

  it("marks @here as a broadcast without naming an offline roster", async () => {
    const fixture = await seed();

    const sent = await send(
      fixture.owner,
      fixture.channelId,
      "@here quick one",
    );

    expect(sent.content).toBe("@here quick one");
    await expect(mentionedUserIds(sent.id)).resolves.toEqual([]);
  });

  it("refuses the broadcast to somebody without the bit", async () => {
    const fixture = await seed();

    const sent = await send(
      fixture.member,
      fixture.channelId,
      "@everyone listen",
    );

    const row = await db.query.messages.findFirst({
      columns: { mentionsEveryone: true },
      where: { id: sent.id },
    });

    expect(row?.mentionsEveryone).toBe(false);
  });
});

describe("mentions in a direct message", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  async function openDm(from: Account, to: Account): Promise<string> {
    const res = await request(app)
      .post("/api/v1/dms")
      .set("Cookie", from.cookies)
      .send({ recipientId: to.id });

    expect(res.status).toBeLessThan(300);

    return idBody.parse(res.body).id;
  }

  it("resolves the other participant's handle", async () => {
    const fixture = await seed();
    const channelId = await openDm(fixture.owner, fixture.member);

    const sent = await send(
      fixture.owner,
      channelId,
      `hey @${fixture.member.username}`,
    );

    expect(sent.content).toBe(`hey <@${fixture.member.id}>`);
    await expect(mentionedUserIds(sent.id)).resolves.toEqual([
      fixture.member.id,
    ]);
  });

  it("leaves a handle from outside the conversation alone", async () => {
    const fixture = await seed();
    const channelId = await openDm(fixture.owner, fixture.member);

    const sent = await send(
      fixture.owner,
      channelId,
      `hey @${fixture.outsider.username}`,
    );

    expect(sent.content).toBe(`hey @${fixture.outsider.username}`);
    await expect(mentionedUserIds(sent.id)).resolves.toEqual([]);
  });

  it("never makes a broadcast out of a direct message", async () => {
    const fixture = await seed();
    const channelId = await openDm(fixture.owner, fixture.member);

    const sent = await send(fixture.owner, channelId, "@everyone and @here");

    expect(sent.content).toBe("@everyone and @here");

    const row = await db.query.messages.findFirst({
      columns: { mentionsEveryone: true },
      where: { id: sent.id },
    });

    expect(row?.mentionsEveryone).toBe(false);
  });

  it("refuses to delete the other participant's message", async () => {
    const fixture = await seed();
    const channelId = await openDm(fixture.owner, fixture.member);

    const sent = await send(fixture.member, channelId, "mine");

    const res = await request(app)
      .delete(`/api/v1/channels/${channelId}/messages/${sent.id}`)
      .set("Cookie", fixture.owner.cookies);

    expect(res.status).toBe(403);
  });
});
