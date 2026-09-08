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
import { type Account, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

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
const reorderBody = z.object({ roles: roleList });

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

function reorderRoles(account: Account, serverId: string, roleIds: string[]) {
  return request(app)
    .patch(`/api/v1/servers/${serverId}/roles/positions`)
    .set("Cookie", account.cookies)
    .send({ roleIds });
}

function positionsOf(serverId: string) {
  return db.query.roles
    .findMany({
      columns: { id: true, name: true, position: true },
      where: { serverId },
      orderBy: { position: "asc" },
    })
    .then((rows) => rows.map((row) => `${row.name}:${String(row.position)}`));
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

  it("carries how many people wear each role", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const hopper = await signUp("hopper");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);
    await join(serverId, hopper);

    const moderators = await seedRole(serverId, "moderator", 0, 1);
    const archivists = await seedRole(serverId, "archivist", 0, 2);

    await assign(serverId, grace, moderators);
    await assign(serverId, hopper, moderators);

    const res = await request(app)
      .get(`/api/v1/servers/${serverId}/roles`)
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject([
      { name: "@everyone", memberCount: 3 },
      { id: moderators, memberCount: 2 },
      { id: archivists, memberCount: 0 },
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

  it("protects the @everyone role's identity, reorder and delete", async () => {
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

  it("lets an authorized caller change what @everyone grants", async () => {
    const ada = await signUp("everyone-perms-owner");
    const serverId = await createServer(ada, "Analytical Engine");
    const everyone = await everyoneRoleId(serverId);

    const next =
      Permissions.VIEW_CHANNEL |
      Permissions.SEND_MESSAGES |
      Permissions.ADD_REACTIONS;

    const res = await patchRole(ada, serverId, everyone, { permissions: next });

    expect(res.status).toBe(200);
    expect(roleBody.parse(res.body)).toMatchObject({
      isDefault: true,
      name: "@everyone",
      permissions: next,
      position: 0,
    });

    const stored = await db.query.roles.findFirst({
      columns: { permissions: true },
      where: { id: everyone },
    });

    expect(stored).toEqual({ permissions: next });
  });

  it("refuses a patch that changes @everyone's identity as well", async () => {
    const ada = await signUp("everyone-perms-mixed");
    const serverId = await createServer(ada, "Analytical Engine");
    const everyone = await everyoneRoleId(serverId);

    const res = await patchRole(ada, serverId, everyone, {
      color: 0x22c55e,
      permissions: Permissions.VIEW_CHANNEL,
    });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ROLE_IS_DEFAULT" } });

    const stored = await db.query.roles.findFirst({
      columns: { color: true, permissions: true },
      where: { id: everyone },
    });

    expect(stored?.color).toBeNull();
    expect(stored?.permissions).not.toBe(Permissions.VIEW_CHANNEL);
  });

  it("refuses a member at the floor, even holding MANAGE_ROLES", async () => {
    const ada = await signUp("everyone-perms-floor-owner");
    const grace = await signUp("everyone-perms-floor");
    const serverId = await createServer(ada, "Analytical Engine");
    const everyone = await everyoneRoleId(serverId);

    await join(serverId, grace);
    await db
      .update(roles)
      .set({ permissions: Permissions.VIEW_CHANNEL | Permissions.MANAGE_ROLES })
      .where(eq(roles.id, everyone));

    const res = await patchRole(grace, serverId, everyone, {
      permissions: ALL_PERMISSIONS,
    });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ROLE_HIERARCHY" } });
  });

  it("refuses to grant @everyone a bit the caller lacks", async () => {
    const ada = await signUp("everyone-perms-escalate-owner");
    const grace = await signUp("everyone-perms-escalate");
    const serverId = await createServer(ada, "Analytical Engine");
    const everyone = await everyoneRoleId(serverId);

    await join(serverId, grace);
    const manager = await seedRole(
      serverId,
      "Manager",
      Permissions.VIEW_CHANNEL | Permissions.MANAGE_ROLES,
      5,
    );
    await assign(serverId, grace, manager);

    const res = await patchRole(grace, serverId, everyone, {
      permissions: Permissions.VIEW_CHANNEL | Permissions.BAN_MEMBERS,
    });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: { code: "PERMISSION_NOT_HELD" },
    });
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

describe("PATCH /api/v1/servers/:serverId/roles/positions", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("renumbers the submitted order from one and audits it", async () => {
    const ada = await signUp("reorder-owner");
    const serverId = await createServer(ada, "Reordering");
    const low = await seedRole(serverId, "low", 0, 1);
    const middle = await seedRole(serverId, "middle", 0, 2);
    const high = await seedRole(serverId, "high", 0, 3);

    const res = await reorderRoles(ada, serverId, [high, low, middle]);

    expect(res.status).toBe(200);
    expect(reorderBody.parse(res.body).roles.map((role) => role.name)).toEqual([
      "@everyone",
      "high",
      "low",
      "middle",
    ]);

    expect(await positionsOf(serverId)).toEqual([
      "@everyone:0",
      "high:1",
      "low:2",
      "middle:3",
    ]);

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.serverId, serverId));

    expect(entry).toMatchObject({ action: "role_update" });
  });

  it("survives several consecutive moves", async () => {
    const ada = await signUp("reorder-repeat");
    const serverId = await createServer(ada, "Repeatedly");
    const a = await seedRole(serverId, "a", 0, 1);
    const b = await seedRole(serverId, "b", 0, 2);
    const c = await seedRole(serverId, "c", 0, 3);

    expect((await reorderRoles(ada, serverId, [b, a, c])).status).toBe(200);
    expect((await reorderRoles(ada, serverId, [b, c, a])).status).toBe(200);
    expect((await reorderRoles(ada, serverId, [c, b, a])).status).toBe(200);

    expect(await positionsOf(serverId)).toEqual([
      "@everyone:0",
      "c:1",
      "b:2",
      "a:3",
    ]);
  });

  it("refuses to rank the @everyone role", async () => {
    const ada = await signUp("reorder-everyone");
    const serverId = await createServer(ada, "Everyone");
    const everyone = await everyoneRoleId(serverId);
    const only = await seedRole(serverId, "only", 0, 1);

    const res = await reorderRoles(ada, serverId, [everyone, only]);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ROLE_IS_DEFAULT" } });
    expect(await positionsOf(serverId)).toEqual(["@everyone:0", "only:1"]);
  });

  it("rejects a repeated role", async () => {
    const ada = await signUp("reorder-duplicate");
    const serverId = await createServer(ada, "Duplicated");
    const one = await seedRole(serverId, "one", 0, 1);

    const res = await reorderRoles(ada, serverId, [one, one]);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "DUPLICATE_ROLE" } });
  });

  it("answers 404 for a role from another server", async () => {
    const ada = await signUp("reorder-stranger");
    const serverId = await createServer(ada, "Ours");
    const elsewhere = await createServer(ada, "Theirs");
    const mine = await seedRole(serverId, "mine", 0, 1);
    const theirs = await seedRole(elsewhere, "theirs", 0, 1);

    const res = await reorderRoles(ada, serverId, [mine, theirs]);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "ROLE_NOT_FOUND" } });
  });

  it("rejects a member without MANAGE_ROLES", async () => {
    const ada = await signUp("reorder-owner-2");
    const bob = await signUp("reorder-member");
    const serverId = await createServer(ada, "Guarded");
    await join(serverId, bob);
    const a = await seedRole(serverId, "a", 0, 1);
    const b = await seedRole(serverId, "b", 0, 2);

    const res = await reorderRoles(bob, serverId, [b, a]);

    expect(res.status).toBe(403);
    expect(await positionsOf(serverId)).toEqual(["@everyone:0", "a:1", "b:2"]);
  });

  it("refuses a move that would carry a role over the caller's own", async () => {
    const ada = await signUp("reorder-hierarchy-owner");
    const bob = await signUp("reorder-hierarchy-manager");
    const serverId = await createServer(ada, "Hierarchy");
    await join(serverId, bob);

    const junior = await seedRole(serverId, "junior", 0, 1);
    const manager = await seedRole(
      serverId,
      "manager",
      Permissions.MANAGE_ROLES,
      2,
    );
    const senior = await seedRole(serverId, "senior", 0, 3);

    await assign(serverId, bob, manager);

    const up = await reorderRoles(bob, serverId, [senior, manager, junior]);

    expect(up.status).toBe(403);
    expect(up.body).toMatchObject({ error: { code: "ROLE_HIERARCHY" } });

    const down = await reorderRoles(bob, serverId, [junior, senior, manager]);

    expect(down.status).toBe(403);
    expect(down.body).toMatchObject({ error: { code: "ROLE_HIERARCHY" } });

    expect(await positionsOf(serverId)).toEqual([
      "@everyone:0",
      "junior:1",
      "manager:2",
      "senior:3",
    ]);
  });

  it("lets a manager reorder only what sits under them", async () => {
    const ada = await signUp("reorder-under-owner");
    const bob = await signUp("reorder-under-manager");
    const serverId = await createServer(ada, "Underneath");
    await join(serverId, bob);

    const first = await seedRole(serverId, "first", 0, 1);
    const second = await seedRole(serverId, "second", 0, 2);
    const manager = await seedRole(
      serverId,
      "manager",
      Permissions.MANAGE_ROLES,
      3,
    );

    await assign(serverId, bob, manager);

    const res = await reorderRoles(bob, serverId, [second, first]);

    expect(res.status).toBe(200);
    expect(await positionsOf(serverId)).toEqual([
      "@everyone:0",
      "second:1",
      "first:2",
      "manager:3",
    ]);
  });

  it("lets the owner move any role, whatever its position", async () => {
    const ada = await signUp("reorder-owner-3");
    const serverId = await createServer(ada, "Owned");
    const low = await seedRole(serverId, "low", 0, 1);
    const high = await seedRole(serverId, "high", ALL_PERMISSIONS, 2);

    const res = await reorderRoles(ada, serverId, [high, low]);

    expect(res.status).toBe(200);
    expect(await positionsOf(serverId)).toEqual([
      "@everyone:0",
      "high:1",
      "low:2",
    ]);
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
