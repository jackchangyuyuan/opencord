import { Permissions } from "@opencord/shared/permissions";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  auditLog,
  roles,
  serverMembers,
  servers,
} from "../../src/db/schema/index.js";
import { requireTestDatabase } from "../setup.js";

const state = vi.hoisted(() => ({ auditFails: false }));

vi.mock("../../src/lib/audit.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/lib/audit.js")>();

  return {
    ...actual,
    writeAudit: (...args: Parameters<typeof actual.writeAudit>) =>
      state.auditFails
        ? Promise.reject(new Error("audit insert failed"))
        : actual.writeAudit(...args),
  };
});

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const serverBody = z.object({ id: z.string() });
const auditPage = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      actorId: z.string(),
      action: z.string(),
      targetType: z.string().nullable(),
      targetId: z.string().nullable(),
      metadata: z.unknown(),
      createdAt: z.string(),
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

function patchServer(account: Account, serverId: string, name: string) {
  return request(app)
    .patch(`/api/v1/servers/${serverId}`)
    .set("Cookie", account.cookies)
    .send({ name });
}

function readAuditLog(account: Account, serverId: string) {
  return request(app)
    .get(`/api/v1/servers/${serverId}/audit-log`)
    .set("Cookie", account.cookies);
}

async function join(serverId: string, account: Account): Promise<void> {
  await db.insert(serverMembers).values({ serverId, userId: account.id });
}

describe("PATCH /api/v1/servers/:serverId", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  beforeEach(() => {
    state.auditFails = false;
  });

  it("renames the server and records one server_update row", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await patchServer(ada, serverId, "Difference Engine");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: serverId, name: "Difference Engine" });

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.serverId, serverId));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: ada.id,
      action: "server_update",
      targetType: "server",
      targetId: serverId,
      metadata: { name: "Difference Engine" },
    });
  });

  it("rolls the mutation back when the audit insert fails", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    state.auditFails = true;

    const res = await patchServer(ada, serverId, "Difference Engine");

    expect(res.status).toBe(500);

    const stored = await db.query.servers.findFirst({
      columns: { name: true },
      where: { id: serverId },
    });

    expect(stored?.name).toBe("Analytical Engine");
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("rejects a member without MANAGE_SERVER and writes nothing", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);

    const res = await patchServer(grace, serverId, "Difference Engine");

    expect(res.status).toBe(403);
    expect(await db.select().from(auditLog)).toEqual([]);

    const stored = await db.query.servers.findFirst({
      columns: { name: true },
      where: { id: serverId },
    });

    expect(stored?.name).toBe("Analytical Engine");
  });

  it("admits a member holding MANAGE_SERVER through a role", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);
    await db
      .update(roles)
      .set({
        permissions: Permissions.VIEW_CHANNEL | Permissions.MANAGE_SERVER,
      })
      .where(and(eq(roles.serverId, serverId), eq(roles.isDefault, true)));

    const res = await patchServer(grace, serverId, "Difference Engine");

    expect(res.status).toBe(200);
  });

  it("rejects a body with nothing to update", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    const res = await request(app)
      .patch(`/api/v1/servers/${serverId}`)
      .set("Cookie", ada.cookies)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });
});

describe("GET /api/v1/servers/:serverId/audit-log", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  beforeEach(() => {
    state.auditFails = false;
  });

  it("pages newest first", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    await patchServer(ada, serverId, "One");
    await patchServer(ada, serverId, "Two");
    await patchServer(ada, serverId, "Three");

    const first = auditPage.parse(
      (await readAuditLog(ada, serverId).query({ limit: 2 })).body,
    );

    expect(first.data).toHaveLength(2);
    expect(first.data.map((entry) => entry.metadata)).toEqual([
      { name: "Three" },
      { name: "Two" },
    ]);
    expect(first.nextCursor).not.toBeNull();

    const second = auditPage.parse(
      (
        await readAuditLog(ada, serverId).query({
          limit: 2,
          cursor: first.nextCursor,
        })
      ).body,
    );

    expect(second.data).toHaveLength(1);
    expect(second.data[0]?.metadata).toEqual({ name: "One" });
    expect(second.nextCursor).toBeNull();
  });

  it("rejects a member without MANAGE_SERVER", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");
    const serverId = await createServer(ada, "Analytical Engine");

    await join(serverId, grace);

    expect((await readAuditLog(grace, serverId)).status).toBe(403);
  });

  it("is scoped to one server", async () => {
    const ada = await signUp("ada");
    const one = await createServer(ada, "One");
    const two = await createServer(ada, "Two");

    await patchServer(ada, one, "One renamed");

    expect(auditPage.parse((await readAuditLog(ada, two)).body).data).toEqual(
      [],
    );
  });
});

describe("the audit log is append-only for a server's lifetime", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  beforeEach(() => {
    state.auditFails = false;
  });

  it("is destroyed with the server it belongs to", async () => {
    const ada = await signUp("ada");
    const serverId = await createServer(ada, "Analytical Engine");

    await patchServer(ada, serverId, "Difference Engine");

    expect(await db.select().from(auditLog)).toHaveLength(1);

    await db.delete(servers).where(eq(servers.id, serverId));

    expect(await db.select().from(auditLog)).toEqual([]);
  });
});
