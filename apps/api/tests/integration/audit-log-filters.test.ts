import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { serverMembers } from "../../src/db/schema/index.js";
import { type Account, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

const serverBody = z.object({ id: z.string() });
const roleBody = z.object({ id: z.string() });
const auditPage = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      actorId: z.string(),
      action: z.string(),
      targetType: z.string().nullable(),
      targetId: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
const peopleList = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    username: z.string(),
    isActor: z.boolean(),
  }),
);

async function createServer(account: Account): Promise<string> {
  const res = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", account.cookies)
    .send({ name: "Analytical Engine" });

  expect(res.status).toBe(201);

  return serverBody.parse(res.body).id;
}

function readLog(account: Account, serverId: string, query = "") {
  return request(app)
    .get(`/api/v1/servers/${serverId}/audit-log${query}`)
    .set("Cookie", account.cookies);
}

async function seedRecords(
  ada: Account,
  serverId: string,
): Promise<{ grace: Account; roleId: string }> {
  const grace = await signUp("grace");

  await db.insert(serverMembers).values({ serverId, userId: grace.id });

  const role = await request(app)
    .post(`/api/v1/servers/${serverId}/roles`)
    .set("Cookie", ada.cookies)
    .send({ name: "Moderators", permissions: 0, position: 1 });

  expect(role.status).toBe(201);

  const roleId = roleBody.parse(role.body).id;

  await request(app)
    .patch(`/api/v1/servers/${serverId}`)
    .set("Cookie", ada.cookies)
    .send({ name: "Difference Engine" });

  const ban = await request(app)
    .put(`/api/v1/servers/${serverId}/bans/${grace.id}`)
    .set("Cookie", ada.cookies)
    .send({ reason: "spam" });

  expect(ban.status).toBe(204);

  return { grace, roleId };
}

describe("GET /api/v1/servers/:serverId/audit-log filters", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("narrows to the actions asked for", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada);

    await seedRecords(ada, serverId);

    const all = auditPage.parse((await readLog(ada, serverId)).body);

    expect(all.data.length).toBeGreaterThan(2);

    const banned = auditPage.parse(
      (await readLog(ada, serverId, "?action=member_ban")).body,
    );

    expect(banned.data).toHaveLength(1);
    expect(banned.data[0]?.action).toBe("member_ban");
  });

  it("accepts several actions as one comma-separated parameter", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada);

    await seedRecords(ada, serverId);

    const page = auditPage.parse(
      (await readLog(ada, serverId, "?action=member_ban,role_create")).body,
    );

    expect(page.data.map((row) => row.action).sort()).toEqual([
      "member_ban",
      "role_create",
    ]);
  });

  it("refuses an action the column has no value for", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada);

    expect((await readLog(ada, serverId, "?action=not_a_thing")).status).toBe(
      400,
    );
  });

  it("groups the two spellings of a person under one target filter", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada);

    await seedRecords(ada, serverId);

    const page = auditPage.parse(
      (await readLog(ada, serverId, "?target=member")).body,
    );

    expect(page.data.length).toBeGreaterThan(0);

    for (const row of page.data) {
      expect(["member", "user"]).toContain(row.targetType);
    }
  });

  it("narrows to one actor", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada);

    const { grace } = await seedRecords(ada, serverId);

    const mine = auditPage.parse(
      (await readLog(ada, serverId, `?actorId=${ada.id}`)).body,
    );

    expect(mine.data.length).toBeGreaterThan(0);
    expect(mine.data.every((row) => row.actorId === ada.id)).toBe(true);

    const theirs = auditPage.parse(
      (await readLog(ada, serverId, `?actorId=${grace.id}`)).body,
    );

    expect(theirs.data).toEqual([]);
  });

  it("includes the whole of the day named at each end", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada);

    await seedRecords(ada, serverId);

    const today = new Date().toISOString().slice(0, 10);

    const page = auditPage.parse(
      (await readLog(ada, serverId, `?from=${today}&to=${today}`)).body,
    );

    expect(page.data.length).toBeGreaterThan(0);

    const before = auditPage.parse(
      (await readLog(ada, serverId, "?from=2020-01-01&to=2020-01-02")).body,
    );

    expect(before.data).toEqual([]);
  });

  it("refuses a day that is not one", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada);

    expect((await readLog(ada, serverId, "?from=yesterday")).status).toBe(400);
  });

  it("searches the actor and the person acted on", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada);

    await seedRecords(ada, serverId);

    const found = auditPage.parse(
      (await readLog(ada, serverId, "?q=grace")).body,
    );

    expect(found.data.length).toBeGreaterThan(0);
    expect(found.data.every((row) => row.action === "member_ban")).toBe(true);

    const missing = auditPage.parse(
      (await readLog(ada, serverId, "?q=nobody")).body,
    );

    expect(missing.data).toEqual([]);
  });

  it("combines filters as an intersection", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada);

    const { grace } = await seedRecords(ada, serverId);

    expect(
      auditPage.parse(
        (await readLog(ada, serverId, `?action=member_ban&actorId=${grace.id}`))
          .body,
      ).data,
    ).toEqual([]);

    expect(
      auditPage.parse(
        (await readLog(ada, serverId, `?action=member_ban&actorId=${ada.id}`))
          .body,
      ).data,
    ).toHaveLength(1);
  });
});

describe("GET /api/v1/servers/:serverId/audit-log/people", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("lists everybody in the record, actor or target", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada);

    const { grace } = await seedRecords(ada, serverId);

    const res = await request(app)
      .get(`/api/v1/servers/${serverId}/audit-log/people`)
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(200);

    const people = peopleList.parse(res.body);

    expect(people).toEqual([
      { id: ada.id, name: "ada", username: "ada", isActor: true },
      { id: grace.id, name: "grace", username: "grace", isActor: false },
    ]);
  });

  it("names somebody once when they are both ends of the record", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada);

    const { grace } = await seedRecords(ada, serverId);

    await request(app)
      .delete(`/api/v1/servers/${serverId}/bans/${grace.id}`)
      .set("Cookie", grace.cookies);

    const res = await request(app)
      .get(`/api/v1/servers/${serverId}/audit-log/people`)
      .set("Cookie", ada.cookies);

    const people = peopleList.parse(res.body);

    expect(people.filter((person) => person.id === ada.id)).toEqual([
      { id: ada.id, name: "ada", username: "ada", isActor: true },
    ]);
  });

  it("is behind the same bit as the record itself", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada);

    const { grace } = await seedRecords(ada, serverId);

    const res = await request(app)
      .get(`/api/v1/servers/${serverId}/audit-log/people`)
      .set("Cookie", grace.cookies);

    expect(res.status).toBe(403);
  });
});
