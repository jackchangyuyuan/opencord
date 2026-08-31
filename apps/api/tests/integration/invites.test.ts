import { Permissions } from "@opencord/shared/permissions";
import { INVITE_CODE_LENGTH } from "@opencord/shared/schemas";
import { and, eq, sql } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  auditLog,
  bans,
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

function redeem(account: Account, code: string) {
  return request(app)
    .post(`/api/v1/invites/${code}`)
    .set("Cookie", account.cookies);
}

function ban(account: Account, serverId: string, userId: string) {
  return request(app)
    .put(`/api/v1/servers/${serverId}/bans/${userId}`)
    .set("Cookie", account.cookies)
    .send({});
}

function memberships(serverId: string, userId: string) {
  return db
    .select({ userId: serverMembers.userId })
    .from(serverMembers)
    .where(
      and(
        eq(serverMembers.serverId, serverId),
        eq(serverMembers.userId, userId),
      ),
    );
}

function banRows(serverId: string, userId: string) {
  return db
    .select({ userId: bans.userId })
    .from(bans)
    .where(and(eq(bans.serverId, serverId), eq(bans.userId, userId)));
}

function usesOf(code: string) {
  return db
    .select({ uses: invites.uses })
    .from(invites)
    .where(eq(invites.code, code))
    .then((rows) => rows[0]?.uses ?? null);
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

describe("invite redemption", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  async function seedWithInvite(
    body: Record<string, unknown> = {},
  ): Promise<Fixture & { code: string; hopper: Account }> {
    const fixture = await seed();
    const hopper = await signUp("hopper");

    const created = await create(fixture.ada, fixture.serverId, body);

    expect(created.status).toBe(201);

    return { ...fixture, hopper, code: inviteBody.parse(created.body).code };
  }

  it("joins the redeemer to the server", async () => {
    const fixture = await seedWithInvite();

    const res = await redeem(fixture.hopper, fixture.code);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      serverId: fixture.serverId,
      alreadyMember: false,
    });

    await expect(
      memberships(fixture.serverId, fixture.hopper.id),
    ).resolves.toHaveLength(1);
    await expect(usesOf(fixture.code)).resolves.toBe(1);
  });

  it("audits the redemption", async () => {
    const fixture = await seedWithInvite();

    await redeem(fixture.hopper, fixture.code);

    const rows = await db
      .select({ action: auditLog.action, actorId: auditLog.actorId })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.serverId, fixture.serverId),
          eq(auditLog.action, "invite_redeem"),
        ),
      );

    expect(rows).toEqual([
      { action: "invite_redeem", actorId: fixture.hopper.id },
    ]);
  });

  it("is a no-op for an existing member and does not burn a use", async () => {
    const fixture = await seedWithInvite();

    const res = await redeem(fixture.grace, fixture.code);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      serverId: fixture.serverId,
      alreadyMember: true,
    });
    await expect(usesOf(fixture.code)).resolves.toBe(0);
  });

  it("refuses an exhausted invite", async () => {
    const fixture = await seedWithInvite({ maxUses: 1 });
    const second = await signUp("lovelace");

    expect((await redeem(fixture.hopper, fixture.code)).status).toBe(200);

    const res = await redeem(second, fixture.code);

    expect(res.status).toBe(409);
    expect(errorBody.parse(res.body).error.code).toBe("INVITE_EXHAUSTED");
    await expect(memberships(fixture.serverId, second.id)).resolves.toEqual([]);
  });

  it("refuses an expired invite", async () => {
    const fixture = await seedWithInvite({ expiresInHours: 1 });

    await db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(invites.code, fixture.code));

    const res = await redeem(fixture.hopper, fixture.code);

    expect(res.status).toBe(409);
    expect(errorBody.parse(res.body).error.code).toBe("INVITE_EXHAUSTED");
  });

  it("refuses a banned user and does not burn a use", async () => {
    const fixture = await seedWithInvite({ maxUses: 1 });

    expect(
      (await ban(fixture.ada, fixture.serverId, fixture.hopper.id)).status,
    ).toBe(204);

    const res = await redeem(fixture.hopper, fixture.code);

    expect(res.status).toBe(403);
    expect(errorBody.parse(res.body).error.code).toBe("USER_BANNED");
    await expect(usesOf(fixture.code)).resolves.toBe(0);
  });

  it("reports an unknown code", async () => {
    const fixture = await seed();

    const res = await redeem(fixture.grace, "AAAAAAAA");

    expect(res.status).toBe(404);
    expect(errorBody.parse(res.body).error.code).toBe("INVITE_NOT_FOUND");
  });

  it("executes the advisory lock statement itself", async () => {
    const fixture = await seedWithInvite();

    const probe = await db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${fixture.serverId} || ':' || ${fixture.hopper.id}, 0))`,
    );

    expect(probe).toBeDefined();
    expect((await redeem(fixture.hopper, fixture.code)).status).toBe(200);
  });

  it("never leaves a ban and a membership standing together", async () => {
    const fixture = await seed();

    const rounds = 5;
    const joiners: Account[] = [];
    const codes: string[] = [];

    for (let round = 0; round < rounds; round += 1) {
      joiners.push(await signUp(`joiner${String(round)}`));

      const created = await create(fixture.ada, fixture.serverId, {
        maxUses: 1,
      });

      expect(created.status).toBe(201);
      codes.push(inviteBody.parse(created.body).code);
    }

    for (let round = 0; round < rounds; round += 1) {
      const joiner = joiners[round];
      const code = codes[round];

      if (joiner === undefined || code === undefined) {
        throw new Error("the fixture is incomplete");
      }

      const [redeemed, banned] = await Promise.all([
        redeem(joiner, code),
        ban(fixture.ada, fixture.serverId, joiner.id),
      ]);

      expect(banned.status).toBe(204);

      await expect(memberships(fixture.serverId, joiner.id)).resolves.toEqual(
        [],
      );
      await expect(banRows(fixture.serverId, joiner.id)).resolves.toHaveLength(
        1,
      );

      const rejected = redeemed.status !== 200;

      expect([200, 403]).toContain(redeemed.status);
      expect(rejected ? errorBody.parse(redeemed.body).error.code : null).toBe(
        rejected ? "USER_BANNED" : null,
      );
      await expect(usesOf(code)).resolves.toBe(rejected ? 0 : 1);
    }
  });
});
