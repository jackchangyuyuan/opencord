import { ALL_PERMISSIONS, Permissions } from "@opencord/shared/permissions";
import { asc, eq } from "drizzle-orm";
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
import { type Account, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

const serverBody = z.object({ id: z.string() });
const roleBody = z.object({ id: z.string(), position: z.number() });

async function createServer(account: Account): Promise<string> {
  const res = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", account.cookies)
    .send({ name: "Analytical Engine" });

  expect(res.status).toBe(201);

  return serverBody.parse(res.body).id;
}

function join(serverId: string, account: Account) {
  return db.insert(serverMembers).values({ serverId, userId: account.id });
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

function assign(serverId: string, account: Account, roleId: string) {
  return db
    .insert(memberRoles)
    .values({ serverId, userId: account.id, roleId });
}

const MANAGER = Permissions.VIEW_CHANNEL | Permissions.MANAGE_ROLES;

async function hierarchy(tag: string) {
  const owner = await signUp(`${tag}-owner`);
  const manager = await signUp(`${tag}-manager`);
  const target = await signUp(`${tag}-target`);
  const serverId = await createServer(owner);

  await join(serverId, manager);
  await join(serverId, target);

  const managerRole = await seedRole(serverId, "manager", MANAGER, 5);
  const peer = await seedRole(serverId, "peer", 0, 5);
  const senior = await seedRole(serverId, "senior", ALL_PERMISSIONS, 9);
  const junior = await seedRole(serverId, "junior", 0, 1);

  await assign(serverId, manager, managerRole);

  return {
    owner,
    manager,
    target,
    serverId,
    managerRole,
    peer,
    senior,
    junior,
  };
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

function reorder(account: Account, serverId: string, roleIds: string[]) {
  return request(app)
    .patch(`/api/v1/servers/${serverId}/roles/positions`)
    .set("Cookie", account.cookies)
    .send({ roleIds });
}

function positionOf(roleId: string): Promise<number | undefined> {
  return db.query.roles
    .findFirst({ columns: { position: true }, where: { id: roleId } })
    .then((role) => role?.position);
}

function nameOf(roleId: string): Promise<string | undefined> {
  return db.query.roles
    .findFirst({ columns: { name: true }, where: { id: roleId } })
    .then((role) => role?.name);
}

describe("a lower-ranked member cannot manage a higher-ranked role", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("refuses to edit a role above them, and changes nothing", async () => {
    const { manager, serverId, senior } = await hierarchy("edit-above");

    const res = await patchRole(manager, serverId, senior, { name: "mine" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ROLE_HIERARCHY" } });
    expect(await nameOf(senior)).toBe("senior");
  });

  it("refuses to edit a role level with their own", async () => {
    const { manager, serverId, peer } = await hierarchy("edit-peer");

    const res = await patchRole(manager, serverId, peer, { name: "mine" });

    expect(res.status).toBe(403);
    expect(await nameOf(peer)).toBe("peer");
  });

  it("refuses to delete a role above them, and the role survives", async () => {
    const { manager, serverId, senior } = await hierarchy("delete-above");

    expect((await deleteRole(manager, serverId, senior)).status).toBe(403);
    expect(await nameOf(senior)).toBe("senior");
  });

  it("refuses to delete a role level with their own", async () => {
    const { manager, serverId, peer } = await hierarchy("delete-peer");

    expect((await deleteRole(manager, serverId, peer)).status).toBe(403);
    expect(await nameOf(peer)).toBe("peer");
  });

  it("refuses to lift a role they may edit above their own rank", async () => {
    const { manager, serverId, junior } = await hierarchy("lift-junior");

    const res = await patchRole(manager, serverId, junior, { position: 9 });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ROLE_HIERARCHY" } });
    expect(await positionOf(junior)).toBe(1);
  });

  it("refuses to lift a role to exactly their own rank", async () => {
    const { manager, serverId, junior } = await hierarchy("lift-level");

    expect(
      (await patchRole(manager, serverId, junior, { position: 5 })).status,
    ).toBe(403);
    expect(await positionOf(junior)).toBe(1);
  });

  it("refuses a reorder that would carry a role over their own rank", async () => {
    const { manager, serverId, junior, managerRole, senior } =
      await hierarchy("reorder-over");

    const res = await reorder(manager, serverId, [senior, managerRole, junior]);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ROLE_HIERARCHY" } });
    expect(await positionOf(junior)).toBe(1);
    expect(await positionOf(senior)).toBe(9);
  });

  it("refuses a reorder that would pull a superior underneath them", async () => {
    const { manager, serverId, junior, managerRole, senior } =
      await hierarchy("reorder-under");

    const res = await reorder(manager, serverId, [junior, senior, managerRole]);

    expect(res.status).toBe(403);
    expect(await positionOf(senior)).toBe(9);
  });

  it("reorders the roles under them after a delete left a gap", async () => {
    const owner = await signUp("gap-owner");
    const manager = await signUp("gap-manager");
    const serverId = await createServer(owner);

    await join(serverId, manager);

    const first = await seedRole(serverId, "first", 0, 1);
    const doomed = await seedRole(serverId, "doomed", 0, 2);
    const third = await seedRole(serverId, "third", 0, 3);
    const managerRole = await seedRole(serverId, "manager", MANAGER, 4);

    await assign(serverId, manager, managerRole);

    expect((await deleteRole(manager, serverId, doomed)).status).toBe(204);

    const res = await reorder(manager, serverId, [third, first]);

    expect(res.status).toBe(200);
    expect(await positionOf(third)).toBe(1);
    expect(await positionOf(first)).toBe(2);
    expect(await positionOf(managerRole)).toBe(3);
  });

  it("refuses to give anybody a role at or above their own rank", async () => {
    const { manager, serverId, target, peer, senior } =
      await hierarchy("assign-above");

    expect(
      (await putMemberRole(manager, serverId, target.id, peer)).status,
    ).toBe(403);
    expect(
      (await putMemberRole(manager, serverId, target.id, senior)).status,
    ).toBe(403);
    expect(await db.select().from(memberRoles)).toHaveLength(1);
  });

  it("refuses to give themselves a role above their own rank", async () => {
    const { manager, serverId, senior } = await hierarchy("assign-self");

    const res = await putMemberRole(manager, serverId, manager.id, senior);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ROLE_HIERARCHY" } });

    const held = await db
      .select({ roleId: memberRoles.roleId })
      .from(memberRoles)
      .where(eq(memberRoles.userId, manager.id));

    expect(held).toHaveLength(1);
  });

  it("still lets them manage everything under their own rank", async () => {
    const { manager, serverId, target, junior } = await hierarchy("permitted");

    expect(
      (await patchRole(manager, serverId, junior, { name: "renamed" })).status,
    ).toBe(200);
    expect(
      (await putMemberRole(manager, serverId, target.id, junior)).status,
    ).toBe(200);
    expect((await deleteRole(manager, serverId, junior)).status).toBe(204);
  });

  it("refuses to hand out a lower role that carries a permission they lack", async () => {
    const { manager, serverId, target } = await hierarchy("assign-escalation");

    const administrator = await seedRole(
      serverId,
      "administrator",
      Permissions.VIEW_CHANNEL | Permissions.ADMINISTRATOR,
      2,
    );

    const toSelf = await putMemberRole(
      manager,
      serverId,
      manager.id,
      administrator,
    );

    expect(toSelf.status).toBe(403);
    expect(toSelf.body).toMatchObject({
      error: { code: "PERMISSION_NOT_HELD" },
    });

    const toOther = await putMemberRole(
      manager,
      serverId,
      target.id,
      administrator,
    );

    expect(toOther.status).toBe(403);
    expect(toOther.body).toMatchObject({
      error: { code: "PERMISSION_NOT_HELD" },
    });

    expect(
      await db
        .select({ roleId: memberRoles.roleId })
        .from(memberRoles)
        .where(eq(memberRoles.roleId, administrator)),
    ).toHaveLength(0);
  });

  it("still hands out a lower role whose permissions it holds", async () => {
    const { manager, serverId, target } = await hierarchy("assign-permitted");

    const helper = await seedRole(
      serverId,
      "helper",
      Permissions.VIEW_CHANNEL | Permissions.MANAGE_ROLES,
      2,
    );

    expect(
      (await putMemberRole(manager, serverId, target.id, helper)).status,
    ).toBe(200);
  });

  it("refuses a member at the floor even holding MANAGE_ROLES", async () => {
    const { serverId, junior, target } = await hierarchy("floor");

    await db
      .update(roles)
      .set({ permissions: MANAGER })
      .where(eq(roles.serverId, serverId));

    const res = await patchRole(target, serverId, junior, { name: "mine" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ROLE_HIERARCHY" } });
  });
});

describe("the owner sits outside the hierarchy", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("may edit, reorder, assign and delete at any position", async () => {
    const { owner, serverId, target, senior, junior } =
      await hierarchy("owner-all");

    expect(
      (await patchRole(owner, serverId, senior, { name: "renamed" })).status,
    ).toBe(200);
    expect(
      (await putMemberRole(owner, serverId, target.id, senior)).status,
    ).toBe(200);
    expect((await reorder(owner, serverId, [senior, junior])).status).toBe(200);
    expect((await deleteRole(owner, serverId, senior)).status).toBe(204);
  });

  it("is refused as the target of a role assignment", async () => {
    const { owner, serverId, junior } = await hierarchy("owner-target");

    const res = await putMemberRole(owner, serverId, owner.id, junior);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "TARGET_IS_OWNER" } });
  });
});

describe("a new role lands at the bottom of the hierarchy", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("shifts every existing role up and takes rank 1", async () => {
    const owner = await signUp("bottom-owner");
    const serverId = await createServer(owner);

    const first = await seedRole(serverId, "first", 0, 1);
    const second = await seedRole(serverId, "second", 0, 2);

    const res = await request(app)
      .post(`/api/v1/servers/${serverId}/roles`)
      .set("Cookie", owner.cookies)
      .send({ name: "New role" });

    expect(res.status).toBe(201);
    expect(roleBody.parse(res.body).position).toBe(1);

    const ordered = await db
      .select({ name: roles.name, position: roles.position })
      .from(roles)
      .where(eq(roles.serverId, serverId))
      .orderBy(asc(roles.position), asc(roles.name));

    expect(ordered).toEqual([
      { name: "@everyone", position: 0 },
      { name: "New role", position: 1 },
      { name: "first", position: 2 },
      { name: "second", position: 3 },
    ]);

    expect(await positionOf(first)).toBe(2);
    expect(await positionOf(second)).toBe(3);
  });

  it("outranks nothing, so it gains no power from where it was inserted", async () => {
    const owner = await signUp("bottom-nothing");
    const serverId = await createServer(owner);

    await seedRole(serverId, "existing", ALL_PERMISSIONS, 1);

    const res = await request(app)
      .post(`/api/v1/servers/${serverId}/roles`)
      .set("Cookie", owner.cookies)
      .send({ name: "New role" });

    const created = roleBody.parse(res.body);
    const beneath = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.serverId, serverId));

    const below = await Promise.all(
      beneath.map(async (role) => ({
        id: role.id,
        position: await positionOf(role.id),
      })),
    );

    expect(
      below.filter(
        (role) =>
          (role.position ?? 0) < created.position && role.position !== 0,
      ),
    ).toEqual([]);
  });

  it("lets a manager create one below themselves", async () => {
    const { manager, serverId, managerRole } =
      await hierarchy("bottom-manager");

    const res = await request(app)
      .post(`/api/v1/servers/${serverId}/roles`)
      .set("Cookie", manager.cookies)
      .send({ name: "New role" });

    expect(res.status).toBe(201);

    const created = roleBody.parse(res.body);

    expect(created.position).toBe(1);
    expect(await positionOf(managerRole)).toBe(6);
  });

  it("refuses a member who holds no rankable role", async () => {
    const { target, serverId } = await hierarchy("bottom-floor");

    await db
      .update(roles)
      .set({ permissions: MANAGER })
      .where(eq(roles.serverId, serverId));

    const res = await request(app)
      .post(`/api/v1/servers/${serverId}/roles`)
      .set("Cookie", target.cookies)
      .send({ name: "New role" });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ROLE_HIERARCHY" } });
  });

  it("honours an explicit position and still ranks it against the caller", async () => {
    const { manager, serverId } = await hierarchy("bottom-explicit");

    const below = await request(app)
      .post(`/api/v1/servers/${serverId}/roles`)
      .set("Cookie", manager.cookies)
      .send({ name: "placed", position: 3 });

    expect(below.status).toBe(201);
    expect(roleBody.parse(below.body).position).toBe(3);

    const above = await request(app)
      .post(`/api/v1/servers/${serverId}/roles`)
      .set("Cookie", manager.cookies)
      .send({ name: "overreach", position: 7 });

    expect(above.status).toBe(403);
  });
});
