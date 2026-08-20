import { Permissions } from "@opencord/shared/permissions";
import { eq } from "drizzle-orm";
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
const validationDetails = z.object({
  error: z.object({ details: z.object({ name: z.array(z.string()).min(1) }) }),
});

interface Account {
  id: string;
  cookies: string[];
}

async function signUp(username: string, name: string): Promise<Account> {
  const res = await request(app)
    .post("/api/auth/sign-up/email")
    .send({
      email: `${username}@example.com`,
      name,
      password,
      username,
    });

  expect(res.status).toBe(200);

  return {
    id: signUpBody.parse(res.body).user.id,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

function createServer(account: Account, name: string) {
  return request(app)
    .post("/api/v1/servers")
    .set("Cookie", account.cookies)
    .send({ name });
}

describe("POST /api/v1/servers", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("creates the server and returns it", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await createServer(ada, "Analytical Engine");

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Analytical Engine",
      ownerId: ada.id,
      iconKey: null,
    });
    expect(res.body).toHaveProperty("createdAt");
  });

  it("creates exactly one @everyone role and no member_roles row", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await createServer(ada, "Analytical Engine");
    const serverId = serverBody.parse(res.body).id;

    const defaultRoles = await db.query.roles.findMany({
      columns: {
        name: true,
        isDefault: true,
        position: true,
        permissions: true,
      },
      where: { serverId },
    });

    expect(defaultRoles).toEqual([
      {
        name: "@everyone",
        isDefault: true,
        position: 0,
        permissions:
          Permissions.VIEW_CHANNEL |
          Permissions.SEND_MESSAGES |
          Permissions.ADD_REACTIONS |
          Permissions.CREATE_INVITE,
      },
    ]);

    expect(await db.query.memberRoles.findMany({})).toEqual([]);
  });

  it("rejects a second default role at the index, not in the service", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await createServer(ada, "Analytical Engine");
    const serverId = serverBody.parse(res.body).id;

    await expect(
      db
        .insert(roles)
        .values({ serverId, name: "impostor", isDefault: true, position: 1 }),
    ).rejects.toThrow();

    const stillOne = await db
      .select()
      .from(roles)
      .where(eq(roles.serverId, serverId));

    expect(stillOne).toHaveLength(1);
  });

  it("makes the owner a member", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await createServer(ada, "Analytical Engine");
    const serverId = serverBody.parse(res.body).id;

    const members = await db
      .select({ userId: serverMembers.userId })
      .from(serverMembers)
      .where(eq(serverMembers.serverId, serverId));

    expect(members).toEqual([{ userId: ada.id }]);
  });

  it("trims the name before storing it", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await createServer(ada, "  Analytical Engine  ");

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Analytical Engine" });
  });

  it("rejects an empty name with field-level details", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await createServer(ada, "   ");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
    expect(() => validationDetails.parse(res.body)).not.toThrow();
  });

  it("rejects a name over the shared bound", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await createServer(ada, "a".repeat(101));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });

  it("writes nothing when validation fails", async () => {
    const ada = await signUp("ada", "Ada");

    expect((await createServer(ada, "")).status).toBe(400);

    expect(await db.query.servers.findMany({})).toEqual([]);
    expect(await db.query.roles.findMany({})).toEqual([]);
  });

  it("requires a session", async () => {
    const res = await request(app)
      .post("/api/v1/servers")
      .send({ name: "Analytical Engine" });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });
});

describe("GET /api/v1/servers", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("is empty for a user who has joined nothing", async () => {
    const ada = await signUp("ada", "Ada");

    const res = await request(app)
      .get("/api/v1/servers")
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns only the servers the caller belongs to", async () => {
    const ada = await signUp("ada", "Ada");
    const grace = await signUp("grace", "Grace");

    await createServer(ada, "Analytical Engine");
    await createServer(ada, "Difference Engine");
    await createServer(grace, "COBOL");

    const res = await request(app)
      .get("/api/v1/servers")
      .set("Cookie", ada.cookies);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body).toMatchObject([
      { name: "Analytical Engine", ownerId: ada.id },
      { name: "Difference Engine", ownerId: ada.id },
    ]);
  });

  it("requires a session", async () => {
    const res = await request(app).get("/api/v1/servers");

    expect(res.status).toBe(401);
  });
});

describe("member_roles stays empty across every server created", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("holds no row for @everyone", async () => {
    const ada = await signUp("ada", "Ada");

    await createServer(ada, "Analytical Engine");
    await createServer(ada, "Difference Engine");

    expect(await db.select().from(memberRoles)).toEqual([]);
  });
});
