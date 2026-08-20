import { ALL_PERMISSIONS, Permissions } from "@opencord/shared/permissions";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  memberRoles,
  roles,
  serverMembers,
} from "../../src/db/schema/index.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const serverBody = z.object({ id: z.string() });
const memberPage = z.object({
  data: z.array(
    z.object({
      user: z.object({ id: z.string(), username: z.string() }),
      nickname: z.string().nullable(),
      joinedAt: z.string(),
      roleIds: z.array(z.string()),
    }),
  ),
  nextCursor: z.string().nullable(),
});

interface Account {
  id: string;
  cookies: string[];
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

function getServer(account: Account, serverId: string) {
  return request(app)
    .get(`/api/v1/servers/${serverId}`)
    .set("Cookie", account.cookies);
}

function renameServer(account: Account, serverId: string) {
  return request(app)
    .patch(`/api/v1/servers/${serverId}`)
    .set("Cookie", account.cookies)
    .send({ name: "Difference Engine" });
}

function setEveryonePermissions(
  serverId: string,
  permissions: number,
): Promise<unknown> {
  return db
    .update(roles)
    .set({ permissions })
    .where(and(eq(roles.serverId, serverId), eq(roles.isDefault, true)));
}

async function join(serverId: string, account: Account): Promise<void> {
  await db.insert(serverMembers).values({ serverId, userId: account.id });
}

async function grantRole(
  serverId: string,
  account: Account,
  permissions: number,
  position = 1,
): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ serverId, name: "granted", permissions, position })
    .returning({ id: roles.id });

  if (role === undefined) {
    throw new Error("the role insert returned no row");
  }

  await db
    .insert(memberRoles)
    .values({ serverId, userId: account.id, roleId: role.id });

  return role.id;
}

describe("requirePermission on GET /api/v1/servers/:serverId", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("serves a member the resolver's inputs rather than a mask", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);
    const roleId = await grantRole(serverId, grace, Permissions.KICK_MEMBERS);

    const res = await getServer(grace, serverId);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: serverId,
      ownerId: ada.id,
      everyoneRole: {
        name: "@everyone",
        isDefault: true,
        position: 0,
        permissions:
          Permissions.VIEW_CHANNEL |
          Permissions.SEND_MESSAGES |
          Permissions.ADD_REACTIONS |
          Permissions.CREATE_INVITE,
      },
      roles: [
        { id: roleId, name: "granted", permissions: Permissions.KICK_MEMBERS },
      ],
    });
    expect(res.body).not.toHaveProperty("permissions");
  });

  it("rejects a non-member with 403", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await getServer(grace, serverId);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("answers 404 for a server that does not exist", async () => {
    const ada = await signUp("ada");

    const res = await getServer(ada, "00000000-0000-7000-8000-000000000000");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("rejects a malformed server id before touching the database", async () => {
    const ada = await signUp("ada");

    const res = await getServer(ada, "not-a-uuid");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });

  it("denies a member whose resolved mask lacks the required bit", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);

    expect((await getServer(grace, serverId)).status).toBe(200);
    expect((await renameServer(grace, serverId)).status).toBe(403);
  });

  it("resolves the owner to ALL without reading a role row", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    await setEveryonePermissions(serverId, 0);

    expect((await renameServer(ada, serverId)).status).toBe(200);
    expect(ALL_PERMISSIONS & Permissions.MANAGE_SERVER).not.toBe(0);
  });

  it("resolves an ADMINISTRATOR past an @everyone role with nothing", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);
    await setEveryonePermissions(serverId, 0);

    expect((await renameServer(grace, serverId)).status).toBe(403);

    await grantRole(serverId, grace, Permissions.ADMINISTRATOR);

    expect((await renameServer(grace, serverId)).status).toBe(200);
  });

  it("requires a session", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await request(app).get(`/api/v1/servers/${serverId}`);

    expect(res.status).toBe(401);
  });
});

describe("GET /api/v1/servers/:serverId/members", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("pages members by keyset and reports their role ids", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);
    const roleId = await grantRole(serverId, grace, Permissions.KICK_MEMBERS);

    const first = await request(app)
      .get(`/api/v1/servers/${serverId}/members`)
      .query({ limit: 1 })
      .set("Cookie", ada.cookies);

    expect(first.status).toBe(200);

    const firstPage = memberPage.parse(first.body);

    expect(firstPage.data).toHaveLength(1);
    expect(firstPage.nextCursor).not.toBeNull();
    expect(firstPage.nextCursor).not.toBe(firstPage.data[0]?.user.id);

    const second = await request(app)
      .get(`/api/v1/servers/${serverId}/members`)
      .query({ limit: 1, cursor: firstPage.nextCursor })
      .set("Cookie", ada.cookies);

    expect(second.status).toBe(200);

    const secondPage = memberPage.parse(second.body);

    expect(secondPage.nextCursor).toBeNull();

    const seen = [...firstPage.data, ...secondPage.data];

    expect(seen).toHaveLength(2);
    expect(seen.find((entry) => entry.user.id === grace.id)).toMatchObject({
      user: { username: "grace" },
      nickname: null,
      roleIds: [roleId],
    });
  });

  it("returns an empty page past the last member", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await request(app)
      .get(`/api/v1/servers/${serverId}/members`)
      .query({ cursor: "\u007f" })
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], nextCursor: null });
  });

  it("clamps the page size at the shared maximum", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await request(app)
      .get(`/api/v1/servers/${serverId}/members`)
      .query({ limit: 1000 })
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });

  it("rejects a non-member with 403", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await request(app)
      .get(`/api/v1/servers/${serverId}/members`)
      .set("Cookie", grace.cookies);

    expect(res.status).toBe(403);
  });
});
