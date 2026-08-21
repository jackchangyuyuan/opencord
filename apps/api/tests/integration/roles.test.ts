import { ALL_PERMISSIONS, Permissions } from "@opencord/shared/permissions";
import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  auditLog,
  memberRoles,
  roles,
  serverMembers,
} from "../../src/db/schema/index.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const serverBody = z.object({ id: z.string() });
const roleBody = z.object({
  id: z.string(),
  name: z.string(),
  color: z.number().nullable(),
  position: z.number(),
  permissions: z.number(),
  isDefault: z.boolean(),
});
const roleList = z.array(roleBody);

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

async function join(serverId: string, account: Account): Promise<void> {
  await db.insert(serverMembers).values({ serverId, userId: account.id });
}

async function seedRole(
  serverId: string,
  name: string,
  permissions: number,
  position: number,
): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ serverId, name, permissions, position })
    .returning({ id: roles.id });

  if (role === undefined) {
    throw new Error("the role insert returned no row");
  }

  return role.id;
}

async function assign(
  serverId: string,
  account: Account,
  roleId: string,
): Promise<void> {
  await db.insert(memberRoles).values({ serverId, userId: account.id, roleId });
}

function postRole(
  account: Account,
  serverId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .post(`/api/v1/servers/${serverId}/roles`)
    .set("Cookie", account.cookies)
    .send(body);
}

function patchRole(
  account: Account,
  serverId: string,
  roleId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .patch(`/api/v1/servers/${serverId}/roles/${roleId}`)
    .set("Cookie", account.cookies)
    .send(body);
}

function deleteRole(account: Account, serverId: string, roleId: string) {
  return request(app)
    .delete(`/api/v1/servers/${serverId}/roles/${roleId}`)
    .set("Cookie", account.cookies);
}

function putMemberRole(
  account: Account,
  serverId: string,
  userId: string,
  roleId: string,
) {
  return request(app)
    .put(`/api/v1/servers/${serverId}/members/${userId}/roles/${roleId}`)
    .set("Cookie", account.cookies);
}

function deleteMemberRole(
  account: Account,
  serverId: string,
  userId: string,
  roleId: string,
) {
  return request(app)
    .delete(`/api/v1/servers/${serverId}/members/${userId}/roles/${roleId}`)
    .set("Cookie", account.cookies);
}

function everyoneRoleId(serverId: string): Promise<string> {
  return db.query.roles
    .findFirst({ columns: { id: true }, where: { serverId, isDefault: true } })
    .then((role) => role?.id ?? "");
}

describe("GET and POST /api/v1/servers/:serverId/roles", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("lists the @everyone role from the creation transaction", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await request(app)
      .get(`/api/v1/servers/${serverId}/roles`)
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(200);
    expect(roleList.parse(res.body)).toMatchObject([
      { name: "@everyone", position: 0, isDefault: true },
    ]);
  });

  it("creates a role and audits it", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await postRole(ada, serverId, {
      name: "moderator",
      color: 0x5865f2,
      permissions: Permissions.MANAGE_MESSAGES,
      position: 3,
    });

    expect(res.status).toBe(201);

    const role = roleBody.parse(res.body);

    expect(role).toMatchObject({
      name: "moderator",
      color: 0x5865f2,
      permissions: Permissions.MANAGE_MESSAGES,
      position: 3,
      isDefault: false,
    });

    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.serverId, serverId));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "role_create",
      targetType: "role",
      targetId: role.id,
    });
  });

  it("refuses position 0, which belongs to @everyone", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await postRole(ada, serverId, {
      name: "impostor",
      position: 0,
    });

    expect(res.status).toBe(400);
  });

  it("rejects a member without MANAGE_ROLES", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);

    expect(
      (await postRole(grace, serverId, { name: "moderator" })).status,
    ).toBe(403);
  });
});

describe("the role hierarchy", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("denies creating a role at or above the caller's own position", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);
    await assign(
      serverId,
      grace,
      await seedRole(serverId, "staff", ALL_PERMISSIONS, 5),
    );

    expect(
      (await postRole(grace, serverId, { name: "peer", position: 5 })).status,
    ).toBe(403);
    expect(
      (await postRole(grace, serverId, { name: "above", position: 6 })).status,
    ).toBe(403);

    const below = await postRole(grace, serverId, {
      name: "below",
      position: 4,
    });

    expect(below.status).toBe(201);
  });

  it("denies granting a permission bit the caller does not hold", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);
    await assign(
      serverId,
      grace,
      await seedRole(
        serverId,
        "staff",
        Permissions.VIEW_CHANNEL | Permissions.MANAGE_ROLES,
        5,
      ),
    );

    const res = await postRole(grace, serverId, {
      name: "overreach",
      permissions: Permissions.BAN_MEMBERS,
    });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: { code: "PERMISSION_NOT_HELD" },
    });
  });

  it("does not let ADMINISTRATOR bypass the hierarchy", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");
    const above = await seedRole(serverId, "senior", 0, 9);

    await join(serverId, grace);
    await assign(
      serverId,
      grace,
      await seedRole(serverId, "admin", Permissions.ADMINISTRATOR, 5),
    );

    expect(
      (await patchRole(grace, serverId, above, { name: "x" })).status,
    ).toBe(403);
    expect((await deleteRole(grace, serverId, above)).status).toBe(403);
  });

  it("lets the owner act on every role, whatever its position", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");
    const high = await seedRole(serverId, "senior", 0, 99);

    expect(
      (await patchRole(ada, serverId, high, { name: "renamed" })).status,
    ).toBe(200);
  });

  it("protects the @everyone role from edits, reorders and deletes", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");
    const everyone = await everyoneRoleId(serverId);

    const renamed = await patchRole(ada, serverId, everyone, {
      name: "nobody",
    });

    expect(renamed.status).toBe(403);
    expect(renamed.body).toMatchObject({ error: { code: "ROLE_IS_DEFAULT" } });
    expect(
      (await patchRole(ada, serverId, everyone, { position: 4 })).status,
    ).toBe(403);
    expect((await deleteRole(ada, serverId, everyone)).status).toBe(403);

    const stored = await db.query.roles.findFirst({
      columns: { name: true, position: true },
      where: { id: everyone },
    });

    expect(stored).toEqual({ name: "@everyone", position: 0 });
  });
});

describe("PATCH and DELETE a role", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("renames, recolours, repermissions and reorders", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");
    const roleId = await seedRole(serverId, "moderator", 0, 1);

    const res = await patchRole(ada, serverId, roleId, {
      name: "senior-moderator",
      color: null,
      permissions: Permissions.KICK_MEMBERS,
      position: 4,
    });

    expect(res.status).toBe(200);
    expect(roleBody.parse(res.body)).toMatchObject({
      name: "senior-moderator",
      color: null,
      permissions: Permissions.KICK_MEMBERS,
      position: 4,
    });

    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.serverId, serverId));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: "role_update" });
  });

  it("rejects a body with nothing to update", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");
    const roleId = await seedRole(serverId, "moderator", 0, 1);

    expect((await patchRole(ada, serverId, roleId, {})).status).toBe(400);
  });

  it("answers 404 for a role from another server", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");
    const other = await createServer(ada, "Difference Engine");
    const foreign = await seedRole(other, "moderator", 0, 1);

    const res = await patchRole(ada, serverId, foreign, { name: "x" });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "ROLE_NOT_FOUND" } });
  });

  it("deletes a role, audits it, and cascades its assignments", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");
    const roleId = await seedRole(serverId, "moderator", 0, 1);

    await join(serverId, grace);
    await assign(serverId, grace, roleId);

    expect((await deleteRole(ada, serverId, roleId)).status).toBe(204);
    expect(await db.select().from(memberRoles)).toEqual([]);

    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.serverId, serverId));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "role_delete",
      targetId: roleId,
      metadata: { name: "moderator" },
    });
  });

  it("rejects a mask outside the twelve bits", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");
    const roleId = await seedRole(serverId, "moderator", 0, 1);

    expect(
      (await patchRole(ada, serverId, roleId, { permissions: 1 << 20 })).status,
    ).toBe(400);
  });
});

describe("assigning and removing member roles", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("assigns a role, audits it, and is idempotent", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");
    const roleId = await seedRole(serverId, "moderator", 0, 1);

    await join(serverId, grace);

    const res = await putMemberRole(ada, serverId, grace.id, roleId);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ roleIds: [roleId] });

    expect((await putMemberRole(ada, serverId, grace.id, roleId)).status).toBe(
      200,
    );
    expect(await db.select().from(memberRoles)).toHaveLength(1);

    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.serverId, serverId));

    expect(entries.map((entry) => entry.action)).toEqual([
      "role_assign",
      "role_assign",
    ]);
    expect(entries[0]).toMatchObject({
      targetType: "member",
      targetId: grace.id,
      metadata: { roleId },
    });
  });

  it("removes a role and audits it", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");
    const roleId = await seedRole(serverId, "moderator", 0, 1);

    await join(serverId, grace);
    await assign(serverId, grace, roleId);

    const res = await deleteMemberRole(ada, serverId, grace.id, roleId);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ roleIds: [] });
    expect(await db.select().from(memberRoles)).toEqual([]);

    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.serverId, serverId));

    expect(entries.map((entry) => entry.action)).toEqual(["role_unassign"]);
  });

  it("refuses the @everyone role outright", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");
    const everyone = await everyoneRoleId(serverId);

    await join(serverId, grace);

    const res = await putMemberRole(ada, serverId, grace.id, everyone);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ROLE_IS_DEFAULT" } });
    expect(await db.select().from(memberRoles)).toEqual([]);
  });

  it("refuses any action on the owner", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");
    const roleId = await seedRole(serverId, "moderator", 0, 1);

    const res = await putMemberRole(ada, serverId, ada.id, roleId);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "TARGET_IS_OWNER" } });
  });

  it("refuses a role at or above the caller's own position", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const hopper = await signUp("hopper");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);
    await join(serverId, hopper);
    await assign(
      serverId,
      grace,
      await seedRole(
        serverId,
        "staff",
        Permissions.VIEW_CHANNEL | Permissions.MANAGE_ROLES,
        5,
      ),
    );

    const peer = await seedRole(serverId, "peer", 0, 5);
    const below = await seedRole(serverId, "below", 0, 4);

    expect((await putMemberRole(grace, serverId, hopper.id, peer)).status).toBe(
      403,
    );
    expect(
      (await putMemberRole(grace, serverId, hopper.id, below)).status,
    ).toBe(200);
  });

  it("requires the target to sit below the caller before removing a role", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const hopper = await signUp("hopper");
    const serverId = await createServer(ada, "Analytical Engine");
    const low = await seedRole(serverId, "low", 0, 1);

    await join(serverId, grace);
    await join(serverId, hopper);
    await assign(
      serverId,
      grace,
      await seedRole(
        serverId,
        "staff",
        Permissions.VIEW_CHANNEL | Permissions.MANAGE_ROLES,
        5,
      ),
    );
    await assign(serverId, hopper, low);
    await assign(serverId, hopper, await seedRole(serverId, "senior", 0, 9));

    expect(
      (await deleteMemberRole(grace, serverId, hopper.id, low)).status,
    ).toBe(403);
    expect((await deleteMemberRole(ada, serverId, hopper.id, low)).status).toBe(
      200,
    );
  });

  it("refuses a role from another server, and the database refuses it too", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");
    const other = await createServer(ada, "Difference Engine");
    const foreign = await seedRole(other, "moderator", 0, 1);

    await join(serverId, grace);

    const res = await putMemberRole(ada, serverId, grace.id, foreign);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "ROLE_NOT_FOUND" } });

    await expect(
      db
        .insert(memberRoles)
        .values({ serverId, userId: grace.id, roleId: foreign }),
    ).rejects.toThrow();
  });

  it("refuses a target who is not a member", async () => {
    const ada = await signUp("ada");
    const stranger = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");
    const roleId = await seedRole(serverId, "moderator", 0, 1);

    const res = await putMemberRole(ada, serverId, stranger.id, roleId);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "MEMBER_NOT_FOUND" } });
  });

  it("rejects a member without MANAGE_ROLES", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");
    const roleId = await seedRole(serverId, "moderator", 0, 1);

    await join(serverId, grace);

    expect(
      (await putMemberRole(grace, serverId, grace.id, roleId)).status,
    ).toBe(403);
  });
});
