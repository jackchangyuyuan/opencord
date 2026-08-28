import { randomUUID } from "node:crypto";

import { Permissions } from "@opencord/shared/permissions";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  channelRoleOverwrites,
  serverMembers,
} from "../../src/db/schema/index.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const idBody = z.object({ id: z.string() });
const errorBody = z.object({ error: z.object({ code: z.string() }) });

const searchBody = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      channelId: z.string(),
      authorId: z.string(),
      content: z.string(),
    }),
  ),
  degraded: z.boolean(),
  limit: z.int(),
  offset: z.int(),
});

interface Account {
  id: string;
  username: string;
  cookies: string[];
}

interface Fixture {
  ada: Account;
  grace: Account;
  serverId: string;
  generalId: string;
  randomId: string;
  everyoneRoleId: string;
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
    username,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

async function createChannel(
  account: Account,
  serverId: string,
  name: string,
): Promise<string> {
  const res = await request(app)
    .post(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", account.cookies)
    .send({ type: "text", name });

  expect(res.status).toBe(201);

  return idBody.parse(res.body).id;
}

async function seed(): Promise<Fixture> {
  const ada = await signUp("ada");
  const grace = await signUp("grace");

  const created = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", ada.cookies)
    .send({ name: "Analytical Engine" });

  expect(created.status).toBe(201);

  const serverId = idBody.parse(created.body).id;

  await db.insert(serverMembers).values({ serverId, userId: grace.id });

  const listed = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", ada.cookies);

  const [general] = z.array(z.object({ id: z.string() })).parse(listed.body);

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
    generalId: general.id,
    randomId: await createChannel(ada, serverId, "random"),
    everyoneRoleId: everyone.id,
  };
}

async function send(
  account: Account,
  channelId: string,
  content: string,
): Promise<string> {
  const res = await request(app)
    .post(`/api/v1/channels/${channelId}/messages`)
    .set("Cookie", account.cookies)
    .send({ content, nonce: randomUUID() });

  expect(res.status).toBe(201);

  return idBody.parse(res.body).id;
}

function search(account: Account, query: Record<string, unknown>) {
  return request(app)
    .get("/api/v1/search")
    .query(query)
    .set("Cookie", account.cookies);
}

describe("GET /api/v1/search", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("returns the messages matching the free-text query", async () => {
    const fixture = await seed();

    const wanted = await send(
      fixture.ada,
      fixture.generalId,
      "the deployment rollback finished",
    );

    await send(fixture.ada, fixture.generalId, "lunch plans");

    const res = await search(fixture.grace, { q: "rollback" });

    expect(res.status).toBe(200);

    const body = searchBody.parse(res.body);

    expect(body.data.map((row) => row.id)).toEqual([wanted]);
    expect(body.degraded).toBe(false);
  });

  it("stems with the english dictionary", async () => {
    const fixture = await seed();

    await send(fixture.ada, fixture.generalId, "we are deploying now");

    const res = await search(fixture.grace, { q: "deploy" });

    expect(searchBody.parse(res.body).data).toHaveLength(1);
  });

  it("never returns a message from a channel the caller cannot view", async () => {
    const fixture = await seed();

    await db.insert(channelRoleOverwrites).values({
      serverId: fixture.serverId,
      channelId: fixture.randomId,
      roleId: fixture.everyoneRoleId,
      allow: 0,
      deny: Permissions.VIEW_CHANNEL,
    });

    await send(fixture.ada, fixture.randomId, "classified rollback");

    const hidden = await search(fixture.grace, { q: "rollback" });

    expect(searchBody.parse(hidden.body).data).toEqual([]);

    const visible = await search(fixture.ada, { q: "rollback" });

    expect(searchBody.parse(visible.body).data).toHaveLength(1);
  });

  it("returns nothing to a caller with no accessible channels", async () => {
    const fixture = await seed();
    const outsider = await signUp("hopper");

    await send(fixture.ada, fixture.generalId, "rollback");

    const res = await search(outsider, { q: "rollback" });

    expect(res.status).toBe(200);
    expect(searchBody.parse(res.body).data).toEqual([]);
  });

  it("runs a filter-only query rather than silently matching nothing", async () => {
    const fixture = await seed();

    const inGeneral = await send(fixture.ada, fixture.generalId, "one");
    const alsoGeneral = await send(fixture.ada, fixture.generalId, "two");

    await send(fixture.ada, fixture.randomId, "elsewhere");

    const res = await search(fixture.grace, { q: "in:#general" });

    expect(res.status).toBe(200);

    const body = searchBody.parse(res.body);

    expect(body.data.map((row) => row.id)).toEqual([alsoGeneral, inGeneral]);
    expect(body.degraded).toBe(false);
  });

  it("filters by author", async () => {
    const fixture = await seed();

    await send(fixture.ada, fixture.generalId, "from ada");

    const fromGrace = await send(
      fixture.grace,
      fixture.generalId,
      "from grace",
    );

    const res = await search(fixture.ada, { q: "from:@grace" });

    expect(searchBody.parse(res.body).data.map((row) => row.id)).toEqual([
      fromGrace,
    ]);
  });

  it("combines free text with a channel filter", async () => {
    const fixture = await seed();

    const wanted = await send(fixture.ada, fixture.generalId, "rollback here");

    await send(fixture.ada, fixture.randomId, "rollback there");

    const res = await search(fixture.grace, { q: "in:#general rollback" });

    expect(searchBody.parse(res.body).data.map((row) => row.id)).toEqual([
      wanted,
    ]);
  });

  it("scopes to one server when server_id is given", async () => {
    const fixture = await seed();

    const other = await request(app)
      .post("/api/v1/servers")
      .set("Cookie", fixture.ada.cookies)
      .send({ name: "Difference Engine" });

    const otherServerId = idBody.parse(other.body).id;

    const otherChannels = await request(app)
      .get(`/api/v1/servers/${otherServerId}/channels`)
      .set("Cookie", fixture.ada.cookies);

    const [otherChannel] = z
      .array(z.object({ id: z.string() }))
      .parse(otherChannels.body);

    if (otherChannel === undefined) {
      throw new Error("the second server has no channel");
    }

    const here = await send(fixture.ada, fixture.generalId, "rollback");

    await send(fixture.ada, otherChannel.id, "rollback");

    const res = await search(fixture.ada, {
      q: "rollback",
      server_id: fixture.serverId,
    });

    expect(searchBody.parse(res.body).data.map((row) => row.id)).toEqual([
      here,
    ]);
  });

  it("marks an all-stopword query degraded and keeps the filters", async () => {
    const fixture = await seed();

    const inGeneral = await send(fixture.ada, fixture.generalId, "one");

    const res = await search(fixture.grace, { q: "in:#general the of and" });

    expect(res.status).toBe(200);

    const body = searchBody.parse(res.body);

    expect(body.degraded).toBe(true);
    expect(body.data.map((row) => row.id)).toEqual([inGeneral]);
  });

  it("returns no rows for an all-stopword query with no filters", async () => {
    const fixture = await seed();

    await send(fixture.ada, fixture.generalId, "one");

    const res = await search(fixture.grace, { q: "the of and" });

    expect(res.status).toBe(200);

    const body = searchBody.parse(res.body);

    expect(body.degraded).toBe(true);
    expect(body.data).toEqual([]);
  });

  it("rejects a query with neither text nor filters", async () => {
    const fixture = await seed();

    const res = await search(fixture.grace, { q: "" });

    expect(res.status).toBe(400);
    expect(errorBody.parse(res.body).error.code).toBe("SEARCH_QUERY_EMPTY");
  });

  it("omits soft-deleted messages", async () => {
    const fixture = await seed();

    const messageId = await send(fixture.ada, fixture.generalId, "rollback");

    const removed = await request(app)
      .delete(`/api/v1/channels/${fixture.generalId}/messages/${messageId}`)
      .set("Cookie", fixture.ada.cookies);

    expect(removed.status).toBe(200);

    const res = await search(fixture.grace, { q: "rollback" });

    expect(searchBody.parse(res.body).data).toEqual([]);
  });

  it("clamps the page size and pages past the cap", async () => {
    const fixture = await seed();

    for (let index = 0; index < 3; index += 1) {
      await send(fixture.ada, fixture.generalId, `rollback ${String(index)}`);
    }

    const clamped = await search(fixture.grace, { q: "rollback", limit: 999 });

    expect(clamped.status).toBe(400);

    const capped = await search(fixture.grace, { q: "rollback", limit: 25 });

    expect(searchBody.parse(capped.body).limit).toBe(25);

    const beyond = await search(fixture.grace, {
      q: "rollback",
      offset: 200,
    });

    const body = searchBody.parse(beyond.body);

    expect(body.data).toEqual([]);
    expect(body.limit).toBe(0);
  });

  it("pages within the cap", async () => {
    const fixture = await seed();

    const ids: string[] = [];

    for (let index = 0; index < 3; index += 1) {
      ids.push(await send(fixture.ada, fixture.generalId, "in:#general seed"));
    }

    const first = await search(fixture.grace, {
      q: "in:#general",
      limit: 2,
      offset: 0,
    });

    const second = await search(fixture.grace, {
      q: "in:#general",
      limit: 2,
      offset: 2,
    });

    expect(searchBody.parse(first.body).data.map((row) => row.id)).toEqual([
      ids[2],
      ids[1],
    ]);
    expect(searchBody.parse(second.body).data.map((row) => row.id)).toEqual([
      ids[0],
    ]);
  });

  it("requires a session", async () => {
    const res = await request(app).get("/api/v1/search").query({ q: "x" });

    expect(res.status).toBe(401);
  });
});
