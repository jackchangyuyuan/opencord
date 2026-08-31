import { Permissions } from "@opencord/shared/permissions";
import { INVITE_CODE_LENGTH } from "@opencord/shared/schemas";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  auditLog,
  invites,
  roles,
  serverMembers,
} from "../../src/db/schema/index.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const idBody = z.object({ id: z.string() });
const errorBody = z.object({ error: z.object({ code: z.string() }) });

const inviteBody = z.object({
  code: z.string(),
  serverId: z.string(),
  inviterId: z.string(),
  maxUses: z.int().nullable(),
  uses: z.int(),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});

const previewBody = z.object({
  code: z.string(),
  server: z.object({
    id: z.string(),
    name: z.string(),
    iconKey: z.string().nullable(),
  }),
  memberCount: z.int(),
});

interface Account {
  id: string;
  cookies: string[];
}

interface Fixture {
  ada: Account;
  grace: Account;
  serverId: string;
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

  return { ada, grace, serverId };
}

function grantEveryone(serverId: string, mask: number) {
  return db
    .update(roles)
    .set({ permissions: mask })
    .where(and(eq(roles.serverId, serverId), eq(roles.isDefault, true)));
}

function create(
  account: Account,
  serverId: string,
  body: Record<string, unknown> = {},
) {
  return request(app)
    .post(`/api/v1/servers/${serverId}/invites`)
    .set("Cookie", account.cookies)
    .send(body);
}

function list(account: Account, serverId: string) {
  return request(app)
    .get(`/api/v1/servers/${serverId}/invites`)
    .set("Cookie", account.cookies);
}

function preview(account: Account, code: string) {
  return request(app)
    .get(`/api/v1/invites/${code}`)
    .set("Cookie", account.cookies);
}

describe("invites", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("mints a code of the documented length", async () => {
    const fixture = await seed();

    const res = await create(fixture.ada, fixture.serverId);

    expect(res.status).toBe(201);

    const body = inviteBody.parse(res.body);

    expect(body.code).toHaveLength(INVITE_CODE_LENGTH);
    expect(body.serverId).toBe(fixture.serverId);
    expect(body.inviterId).toBe(fixture.ada.id);
    expect(body.uses).toBe(0);
  });

  it("defaults max uses and expiry to unlimited and never", async () => {
    const fixture = await seed();

    const body = inviteBody.parse(
      (await create(fixture.ada, fixture.serverId)).body,
    );

    expect(body.maxUses).toBeNull();
    expect(body.expiresAt).toBeNull();
  });

  it("records the limits it was given", async () => {
    const fixture = await seed();

    const body = inviteBody.parse(
      (
        await create(fixture.ada, fixture.serverId, {
          maxUses: 5,
          expiresInHours: 2,
        })
      ).body,
    );

    expect(body.maxUses).toBe(5);
    expect(body.expiresAt).not.toBeNull();
  });

  it("mints distinct codes", async () => {
    const fixture = await seed();

    const first = inviteBody.parse(
      (await create(fixture.ada, fixture.serverId)).body,
    );
    const second = inviteBody.parse(
      (await create(fixture.ada, fixture.serverId)).body,
    );

    expect(first.code).not.toBe(second.code);
  });

  it("refuses creation without CREATE_INVITE", async () => {
    const fixture = await seed();

    await grantEveryone(fixture.serverId, Permissions.VIEW_CHANNEL);

    const res = await create(fixture.grace, fixture.serverId);

    expect(res.status).toBe(403);

    const rows = await db
      .select()
      .from(invites)
      .where(eq(invites.serverId, fixture.serverId));

    expect(rows).toEqual([]);
  });

  it("hides the invite list without CREATE_INVITE", async () => {
    const fixture = await seed();

    await grantEveryone(fixture.serverId, Permissions.VIEW_CHANNEL);

    expect((await list(fixture.grace, fixture.serverId)).status).toBe(403);
  });

  it("lists this server's invites", async () => {
    const fixture = await seed();

    const created = inviteBody.parse(
      (await create(fixture.ada, fixture.serverId)).body,
    );

    const res = await list(fixture.ada, fixture.serverId);

    expect(res.status).toBe(200);
    expect(
      z
        .array(inviteBody)
        .parse(res.body)
        .map((row) => row.code),
    ).toEqual([created.code]);
  });

  it("audits creation", async () => {
    const fixture = await seed();

    const created = inviteBody.parse(
      (await create(fixture.ada, fixture.serverId)).body,
    );

    const rows = await db
      .select({ action: auditLog.action, targetId: auditLog.targetId })
      .from(auditLog)
      .where(eq(auditLog.serverId, fixture.serverId));

    expect(rows).toEqual([{ action: "invite_create", targetId: created.code }]);
  });

  it("previews the server without channels or member identities", async () => {
    const fixture = await seed();
    const stranger = await signUp("hopper");

    const created = inviteBody.parse(
      (await create(fixture.ada, fixture.serverId)).body,
    );

    const res = await preview(stranger, created.code);

    expect(res.status).toBe(200);

    const body = previewBody.parse(res.body);

    expect(body.server).toEqual({
      id: fixture.serverId,
      name: "Analytical Engine",
      iconKey: null,
    });
    expect(body.memberCount).toBe(2);
    expect(res.body).not.toHaveProperty("channels");
    expect(res.body).not.toHaveProperty("members");
  });

  it("reports an unknown code", async () => {
    const fixture = await seed();

    const res = await preview(fixture.grace, "AAAAAAAA");

    expect(res.status).toBe(404);
    expect(errorBody.parse(res.body).error.code).toBe("INVITE_NOT_FOUND");
  });

  it("rejects a malformed code", async () => {
    const fixture = await seed();

    expect((await preview(fixture.grace, "short")).status).toBe(400);
  });

  it("requires a session for the preview", async () => {
    const fixture = await seed();

    const created = inviteBody.parse(
      (await create(fixture.ada, fixture.serverId)).body,
    );

    const res = await request(app).get(`/api/v1/invites/${created.code}`);

    expect(res.status).toBe(401);
  });

  it("drops the invites when the server is deleted", async () => {
    const fixture = await seed();

    await create(fixture.ada, fixture.serverId);

    const removed = await request(app)
      .delete(`/api/v1/servers/${fixture.serverId}`)
      .set("Cookie", fixture.ada.cookies);

    expect(removed.status).toBe(204);

    const rows = await db
      .select()
      .from(invites)
      .where(eq(invites.serverId, fixture.serverId));

    expect(rows).toEqual([]);
  });
});
