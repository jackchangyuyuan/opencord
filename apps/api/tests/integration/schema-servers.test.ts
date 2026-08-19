import { DrizzleQueryError, eq } from "drizzle-orm";
import postgres from "postgres";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "../../src/db/index.js";
import {
  memberRoles,
  roles,
  serverMembers,
  servers,
  users,
} from "../../src/db/schema/index.js";
import { requireTestDatabase } from "../setup.js";

const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

async function seedUser(id: string): Promise<string> {
  await db
    .insert(users)
    .values({ id, name: id, email: `${id}@example.com`, username: id });

  return id;
}

async function seedServer(name: string, ownerId: string): Promise<string> {
  const [server] = await db
    .insert(servers)
    .values({ name, ownerId })
    .returning({ id: servers.id });

  if (server === undefined) {
    throw new Error("the server insert returned no row");
  }

  return server.id;
}

async function seedRole(
  serverId: string,
  name: string,
  isDefault = false,
): Promise<string> {
  const [role] = await db
    .insert(roles)
    .values({ serverId, name, isDefault })
    .returning({ id: roles.id });

  if (role === undefined) {
    throw new Error("the role insert returned no row");
  }

  return role.id;
}

async function rejection(
  statement: () => Promise<unknown>,
): Promise<postgres.PostgresError> {
  try {
    await statement();
  } catch (error) {
    if (
      error instanceof DrizzleQueryError &&
      error.cause instanceof postgres.PostgresError
    ) {
      return error.cause;
    }

    throw error;
  }

  throw new Error("expected the statement to be rejected");
}

describe("member_roles composite foreign keys", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("rejects a role from another server", async () => {
    const owner = await seedUser("owner");
    const serverA = await seedServer("A", owner);
    const serverB = await seedServer("B", owner);
    const roleOfB = await seedRole(serverB, "moderator");

    await db.insert(serverMembers).values({ serverId: serverA, userId: owner });

    const error = await rejection(() =>
      db
        .insert(memberRoles)
        .values({ serverId: serverA, userId: owner, roleId: roleOfB }),
    );

    expect(error.code).toBe(FOREIGN_KEY_VIOLATION);
    expect(error.constraint_name).toBe("member_roles_role_id_server_id_fkey");
  });

  it("rejects a user who is not a member of the server", async () => {
    const owner = await seedUser("owner");
    const stranger = await seedUser("stranger");
    const server = await seedServer("A", owner);
    const role = await seedRole(server, "moderator");

    const error = await rejection(() =>
      db
        .insert(memberRoles)
        .values({ serverId: server, userId: stranger, roleId: role }),
    );

    expect(error.code).toBe(FOREIGN_KEY_VIOLATION);
    expect(error.constraint_name).toBe("member_roles_server_id_user_id_fkey");
  });

  it("accepts a role assignment inside one server", async () => {
    const owner = await seedUser("owner");
    const server = await seedServer("A", owner);
    const role = await seedRole(server, "moderator");

    await db.insert(serverMembers).values({ serverId: server, userId: owner });
    await db
      .insert(memberRoles)
      .values({ serverId: server, userId: owner, roleId: role });

    const rows = await db.select().from(memberRoles);

    expect(rows).toEqual([{ serverId: server, userId: owner, roleId: role }]);
  });
});

describe("the @everyone partial unique index", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("rejects a second default role in one server", async () => {
    const owner = await seedUser("owner");
    const server = await seedServer("A", owner);

    await seedRole(server, "@everyone", true);

    const error = await rejection(() => seedRole(server, "@everyone", true));

    expect(error.code).toBe(UNIQUE_VIOLATION);
    expect(error.constraint_name).toBe("roles_server_id_is_default_uidx");
  });

  it("accepts one default role in each of two servers", async () => {
    const owner = await seedUser("owner");
    const serverA = await seedServer("A", owner);
    const serverB = await seedServer("B", owner);

    await seedRole(serverA, "@everyone", true);
    await seedRole(serverB, "@everyone", true);

    const defaults = await db
      .select({ serverId: roles.serverId })
      .from(roles)
      .where(eq(roles.isDefault, true));

    expect(defaults).toHaveLength(2);
  });

  it("leaves non-default roles unconstrained", async () => {
    const owner = await seedUser("owner");
    const server = await seedServer("A", owner);

    await seedRole(server, "moderator");
    await seedRole(server, "muted");

    const rows = await db.select().from(roles);

    expect(rows).toHaveLength(2);
  });
});

describe("server deletion", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("cascades to members, roles and role assignments", async () => {
    const owner = await seedUser("owner");
    const server = await seedServer("A", owner);
    const role = await seedRole(server, "moderator");

    await db.insert(serverMembers).values({ serverId: server, userId: owner });
    await db
      .insert(memberRoles)
      .values({ serverId: server, userId: owner, roleId: role });

    await db.delete(servers).where(eq(servers.id, server));

    expect(await db.select().from(serverMembers)).toHaveLength(0);
    expect(await db.select().from(roles)).toHaveLength(0);
    expect(await db.select().from(memberRoles)).toHaveLength(0);
    expect(await db.select().from(users)).toHaveLength(1);
  });
});

describe("the uuidv7() column default", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("generates version 7 identifiers without the application supplying one", async () => {
    const owner = await seedUser("owner");
    const server = await seedServer("A", owner);
    const role = await seedRole(server, "moderator");

    for (const id of [server, role]) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });
});
