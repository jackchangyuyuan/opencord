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
  servers,
} from "../../src/db/schema/index.js";
import { lockedServerOwner } from "../../src/modules/members/queries.js";
import { type Account, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

const serverBody = z.object({ id: z.string() });

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

function transfer(account: Account, serverId: string, userId: string) {
  return request(app)
    .post(`/api/v1/servers/${serverId}/owner`)
    .set("Cookie", account.cookies)
    .send({ userId });
}

function leave(account: Account, serverId: string) {
  return request(app)
    .delete(`/api/v1/servers/${serverId}/members/@me`)
    .set("Cookie", account.cookies);
}

function countMembers(serverId: string): Promise<{ userId: string }[]> {
  return db
    .select({ userId: serverMembers.userId })
    .from(serverMembers)
    .where(eq(serverMembers.serverId, serverId));
}

describe("POST /api/v1/servers/:serverId/owner", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("moves ownership and writes one server_transfer row", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);

    const res = await transfer(ada, serverId, grace.id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: serverId, ownerId: grace.id });

    const stored = await db.query.servers.findFirst({
      columns: { ownerId: true },
      where: { id: serverId },
    });

    expect(stored?.ownerId).toBe(grace.id);

    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.serverId, serverId));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorId: ada.id,
      action: "server_transfer",
      targetType: "user",
      targetId: grace.id,
    });
  });

  it("resolves the new owner to ALL and demotes the old one", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);
    await db
      .update(roles)
      .set({ permissions: 0 })
      .where(eq(roles.serverId, serverId));

    expect((await transfer(ada, serverId, grace.id)).status).toBe(200);

    const asGrace = await request(app)
      .patch(`/api/v1/servers/${serverId}`)
      .set("Cookie", grace.cookies)
      .send({ name: "Difference Engine" });

    expect(asGrace.status).toBe(200);

    const asAda = await request(app)
      .patch(`/api/v1/servers/${serverId}`)
      .set("Cookie", ada.cookies)
      .send({ name: "Analytical Engine" });

    expect(asAda.status).toBe(403);
  });

  it("rejects a member who is not the owner", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);

    const res = await transfer(grace, serverId, grace.id);

    expect(res.status).toBe(403);
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("rejects a target who is not a member", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await transfer(ada, serverId, grace.id);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "MEMBER_NOT_FOUND" } });
  });

  it("rejects a transfer to the current owner", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await transfer(ada, serverId, ada.id);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { code: "ALREADY_OWNER" } });
  });
});

describe("DELETE /api/v1/servers/:serverId/members/@me", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("refuses the owner and leaves membership unchanged", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);

    const res = await leave(ada, serverId);

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: { code: "OWNER_MUST_TRANSFER" },
    });
    expect(await countMembers(serverId)).toHaveLength(2);
  });

  it("lets the former owner leave once ownership has moved", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);

    expect((await transfer(ada, serverId, grace.id)).status).toBe(200);
    expect((await leave(ada, serverId)).status).toBe(204);
    expect(await countMembers(serverId)).toEqual([{ userId: grace.id }]);
  });

  it("cascades the leaver's role assignments", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);

    const [role] = await db
      .insert(roles)
      .values({ serverId, name: "moderator", position: 1 })
      .returning({ id: roles.id });

    await db.insert(memberRoles).values({
      serverId,
      userId: grace.id,
      roleId: role?.id ?? "",
    });

    expect((await leave(grace, serverId)).status).toBe(204);
    expect(await db.select().from(memberRoles)).toEqual([]);
  });

  it("rejects a non-member", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    expect((await leave(grace, serverId)).status).toBe(403);
  });
});

describe("DELETE /api/v1/servers/:serverId", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("lets the owner delete the server and everything under it", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await request(app)
      .delete(`/api/v1/servers/${serverId}`)
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(204);
    expect(await db.select().from(servers)).toEqual([]);
    expect(await db.select().from(roles)).toEqual([]);
    expect(await db.select().from(serverMembers)).toEqual([]);
  });

  it("rejects a member who is not the owner", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);

    const res = await request(app)
      .delete(`/api/v1/servers/${serverId}`)
      .set("Cookie", grace.cookies);

    expect(res.status).toBe(403);
    expect(await db.select().from(servers)).toHaveLength(1);
  });
});

describe("ownership and membership changing at the same time", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  function kick(actor: Account, serverId: string, userId: string) {
    return request(app)
      .delete(`/api/v1/servers/${serverId}/members/${userId}`)
      .set("Cookie", actor.cookies);
  }

  it("refuses to act on a server that went away under the lock", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    await db.delete(servers).where(eq(servers.id, serverId));

    await expect(
      db.transaction((tx) => lockedServerOwner(tx, serverId)),
    ).rejects.toMatchObject({ code: "SERVER_NOT_FOUND" });
  });

  it("never hands the server to somebody it is removing", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);

    const [transferred, kicked] = await Promise.all([
      transfer(ada, serverId, grace.id),
      kick(ada, serverId, grace.id),
    ]);

    const [owner] = await db
      .select({ ownerId: servers.ownerId })
      .from(servers)
      .where(eq(servers.id, serverId));

    const members = (await countMembers(serverId)).map((row) => row.userId);

    expect(members).toContain(owner?.ownerId);
    expect([transferred.status, kicked.status]).not.toEqual([200, 204]);
  });

  it("never lets the incoming owner leave on their way in", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);

    await Promise.all([
      transfer(ada, serverId, grace.id),
      leave(grace, serverId),
    ]);

    const [owner] = await db
      .select({ ownerId: servers.ownerId })
      .from(servers)
      .where(eq(servers.id, serverId));

    const members = (await countMembers(serverId)).map((row) => row.userId);

    expect(members).toContain(owner?.ownerId);
  });

  it("lets only one of two simultaneous transfers take effect", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const hopper = await signUp("hopper");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);
    await join(serverId, hopper);

    const answers = await Promise.all([
      transfer(ada, serverId, grace.id),
      transfer(ada, serverId, hopper.id),
    ]);

    const [owner] = await db
      .select({ ownerId: servers.ownerId })
      .from(servers)
      .where(eq(servers.id, serverId));

    expect(answers.filter((res) => res.status === 200)).toHaveLength(1);
    expect([grace.id, hopper.id]).toContain(owner?.ownerId);

    const transfers = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.action, "server_transfer"));

    expect(transfers).toHaveLength(1);
  });
});
