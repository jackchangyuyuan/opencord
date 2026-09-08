import { Permissions } from "@opencord/shared/permissions";
import { and, DrizzleQueryError, eq } from "drizzle-orm";
import postgres from "postgres";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import {
  auditLog,
  channelMemberOverwrites,
  channelRoleOverwrites,
  memberRoles,
  roles,
  serverMembers,
} from "../../src/db/schema/index.js";
import { type Account, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

const FOREIGN_KEY_VIOLATION = "23503";

const serverBody = z.object({ id: z.string() });
const channelList = z.array(z.object({ id: z.string(), name: z.string() }));
const overwritesBody = z.object({
  roles: z.array(
    z.object({ roleId: z.string(), allow: z.number(), deny: z.number() }),
  ),
  members: z.array(
    z.object({ userId: z.string(), allow: z.number(), deny: z.number() }),
  ),
});

interface Fixture {
  ada: Account;
  grace: Account;
  serverId: string;
  channelId: string;
  everyoneRoleId: string;
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

async function createServer(account: Account, name: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/servers")
    .set("Cookie", account.cookies)
    .send({ name });

  expect(res.status).toBe(201);

  return serverBody.parse(res.body).id;
}

async function seed(): Promise<Fixture> {
  const ada = await signUp("ada");
  const grace = await signUp("grace");
  const serverId = await createServer(ada, "Analytical Engine");

  await db.insert(serverMembers).values({ serverId, userId: grace.id });

  const res = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", ada.cookies);

  const [channel] = channelList.parse(res.body);

  const everyone = await db.query.roles.findFirst({
    columns: { id: true },
    where: { serverId, isDefault: true },
  });

  if (channel === undefined || everyone === undefined) {
    throw new Error("the fixture is incomplete");
  }

  return {
    ada,
    grace,
    serverId,
    channelId: channel.id,
    everyoneRoleId: everyone.id,
  };
}

function putRoleOverwrite(
  account: Account,
  channelId: string,
  roleId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .put(`/api/v1/channels/${channelId}/overwrites/roles/${roleId}`)
    .set("Cookie", account.cookies)
    .send(body);
}

function putMemberOverwrite(
  account: Account,
  channelId: string,
  userId: string,
  body: Record<string, unknown>,
) {
  return request(app)
    .put(`/api/v1/channels/${channelId}/overwrites/members/${userId}`)
    .set("Cookie", account.cookies)
    .send(body);
}

async function promoteToModerator(fixture: Fixture): Promise<void> {
  const [role] = await db
    .insert(roles)
    .values({
      serverId: fixture.serverId,
      name: "Moderator",
      permissions: Permissions.VIEW_CHANNEL | Permissions.MANAGE_ROLES,
      position: 5,
    })
    .returning();

  if (role === undefined) {
    throw new Error("the fixture is incomplete");
  }

  await db.insert(memberRoles).values({
    serverId: fixture.serverId,
    userId: fixture.grace.id,
    roleId: role.id,
  });
}

function getChannel(account: Account, channelId: string) {
  return request(app)
    .get(`/api/v1/channels/${channelId}`)
    .set("Cookie", account.cookies);
}

describe("the overwrite routes", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("writes, updates and reads both kinds in one response", async () => {
    const fixture = await seed();

    const created = await putRoleOverwrite(
      fixture.ada,
      fixture.channelId,
      fixture.everyoneRoleId,
      { deny: Permissions.SEND_MESSAGES },
    );

    expect(created.status).toBe(200);
    expect(overwritesBody.parse(created.body)).toEqual({
      roles: [
        {
          roleId: fixture.everyoneRoleId,
          allow: 0,
          deny: Permissions.SEND_MESSAGES,
        },
      ],
      members: [],
    });

    const updated = await putRoleOverwrite(
      fixture.ada,
      fixture.channelId,
      fixture.everyoneRoleId,
      { allow: Permissions.MANAGE_MESSAGES, deny: 0 },
    );

    expect(overwritesBody.parse(updated.body).roles).toEqual([
      {
        roleId: fixture.everyoneRoleId,
        allow: Permissions.MANAGE_MESSAGES,
        deny: 0,
      },
    ]);

    const withMember = await putMemberOverwrite(
      fixture.ada,
      fixture.channelId,
      fixture.grace.id,
      { deny: Permissions.VIEW_CHANNEL },
    );

    expect(overwritesBody.parse(withMember.body).members).toEqual([
      {
        userId: fixture.grace.id,
        allow: 0,
        deny: Permissions.VIEW_CHANNEL,
      },
    ]);
  });

  it("audits every write and every delete", async () => {
    const fixture = await seed();

    await putRoleOverwrite(
      fixture.ada,
      fixture.channelId,
      fixture.everyoneRoleId,
      { deny: Permissions.SEND_MESSAGES },
    );

    const removed = await request(app)
      .delete(
        `/api/v1/channels/${fixture.channelId}/overwrites/roles/${fixture.everyoneRoleId}`,
      )
      .set("Cookie", fixture.ada.cookies);

    expect(removed.status).toBe(204);

    const entries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.serverId, fixture.serverId))
      .orderBy(auditLog.id);

    expect(entries.map((entry) => entry.action)).toEqual([
      "overwrite_update",
      "overwrite_delete",
    ]);
    expect(entries[0]).toMatchObject({
      targetType: "role",
      targetId: fixture.everyoneRoleId,
      metadata: { channelId: fixture.channelId },
    });
    expect(await db.select().from(channelRoleOverwrites)).toEqual([]);
  });

  it("rejects a role from another server", async () => {
    const fixture = await seed();
    const other = await createServer(fixture.ada, "Difference Engine");
    const foreign = await db.query.roles.findFirst({
      columns: { id: true },
      where: { serverId: other, isDefault: true },
    });

    const res = await putRoleOverwrite(
      fixture.ada,
      fixture.channelId,
      foreign?.id ?? "",
      { deny: Permissions.SEND_MESSAGES },
    );

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "ROLE_NOT_FOUND" } });
  });

  it("rejects a member of another server", async () => {
    const fixture = await seed();
    const stranger = await signUp("hopper");

    const res = await putMemberOverwrite(
      fixture.ada,
      fixture.channelId,
      stranger.id,
      { deny: Permissions.VIEW_CHANNEL },
    );

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: "MEMBER_NOT_FOUND" } });
  });

  it("rejects a member without MANAGE_ROLES", async () => {
    const fixture = await seed();

    const res = await putRoleOverwrite(
      fixture.grace,
      fixture.channelId,
      fixture.everyoneRoleId,
      { deny: Permissions.SEND_MESSAGES },
    );

    expect(res.status).toBe(403);
    expect(await db.select().from(channelRoleOverwrites)).toEqual([]);
  });

  it("rejects a delete from a member without MANAGE_ROLES", async () => {
    const fixture = await seed();

    const created = await putRoleOverwrite(
      fixture.ada,
      fixture.channelId,
      fixture.everyoneRoleId,
      { deny: Permissions.SEND_MESSAGES },
    );

    expect(created.status).toBe(200);

    const res = await request(app)
      .delete(
        `/api/v1/channels/${fixture.channelId}/overwrites/roles/${fixture.everyoneRoleId}`,
      )
      .set("Cookie", fixture.grace.cookies);

    expect(res.status).toBe(403);
    expect(await db.select().from(channelRoleOverwrites)).toHaveLength(1);
  });

  it("rejects a member overwrite delete from a member without MANAGE_ROLES", async () => {
    const fixture = await seed();

    const created = await putMemberOverwrite(
      fixture.ada,
      fixture.channelId,
      fixture.grace.id,
      { deny: Permissions.SEND_MESSAGES },
    );

    expect(created.status).toBe(200);

    const res = await request(app)
      .delete(
        `/api/v1/channels/${fixture.channelId}/overwrites/members/${fixture.grace.id}`,
      )
      .set("Cookie", fixture.grace.cookies);

    expect(res.status).toBe(403);
    expect(await db.select().from(channelMemberOverwrites)).toHaveLength(1);
  });

  it("lets a member without MANAGE_ROLES read the overwrites", async () => {
    const fixture = await seed();

    await putRoleOverwrite(
      fixture.ada,
      fixture.channelId,
      fixture.everyoneRoleId,
      { deny: Permissions.SEND_MESSAGES },
    );

    const res = await request(app)
      .get(`/api/v1/channels/${fixture.channelId}/overwrites`)
      .set("Cookie", fixture.grace.cookies);

    expect(res.status).toBe(200);
    expect(overwritesBody.parse(res.body).roles).toHaveLength(1);
  });

  it("refuses to grant a permission the caller does not itself hold", async () => {
    const fixture = await seed();

    await promoteToModerator(fixture);

    const res = await putMemberOverwrite(
      fixture.grace,
      fixture.channelId,
      fixture.grace.id,
      {
        allow: Permissions.MANAGE_MESSAGES | Permissions.MENTION_EVERYONE,
      },
    );

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: { code: "PERMISSION_NOT_HELD" },
    });
    expect(await db.select().from(channelMemberOverwrites)).toEqual([]);
  });

  it("lets a moderator pass on a permission it does hold", async () => {
    const fixture = await seed();

    await promoteToModerator(fixture);

    const res = await putMemberOverwrite(
      fixture.grace,
      fixture.channelId,
      fixture.grace.id,
      { allow: Permissions.VIEW_CHANNEL },
    );

    expect(res.status).toBe(200);
  });

  it("refuses an overwrite for a role at or above the caller's own", async () => {
    const fixture = await seed();

    await promoteToModerator(fixture);

    const [admin] = await db
      .insert(roles)
      .values({
        serverId: fixture.serverId,
        name: "Admin",
        permissions: Permissions.VIEW_CHANNEL,
        position: 9,
      })
      .returning();

    if (admin === undefined) {
      throw new Error("the fixture is incomplete");
    }

    const res = await putRoleOverwrite(
      fixture.grace,
      fixture.channelId,
      admin.id,
      { deny: Permissions.VIEW_CHANNEL },
    );

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ROLE_HIERARCHY" } });
    expect(await db.select().from(channelRoleOverwrites)).toEqual([]);
  });

  it("refuses a member overwrite for someone the caller does not outrank", async () => {
    const fixture = await seed();

    await promoteToModerator(fixture);

    const hopper = await signUp("hopper");

    await db
      .insert(serverMembers)
      .values({ serverId: fixture.serverId, userId: hopper.id });

    const [admin] = await db
      .insert(roles)
      .values({
        serverId: fixture.serverId,
        name: "Admin",
        permissions: Permissions.VIEW_CHANNEL,
        position: 9,
      })
      .returning();

    if (admin === undefined) {
      throw new Error("the fixture is incomplete");
    }

    await db.insert(memberRoles).values({
      serverId: fixture.serverId,
      userId: hopper.id,
      roleId: admin.id,
    });

    const res = await putMemberOverwrite(
      fixture.grace,
      fixture.channelId,
      hopper.id,
      { deny: Permissions.VIEW_CHANNEL },
    );

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: "ROLE_HIERARCHY" } });
  });

  it("rejects a mask outside the twelve bits", async () => {
    const fixture = await seed();

    const res = await putRoleOverwrite(
      fixture.ada,
      fixture.channelId,
      fixture.everyoneRoleId,
      { deny: 1 << 20 },
    );

    expect(res.status).toBe(400);
  });

  it("refuses an overwrite naming a permission held server-wide", async () => {
    const fixture = await seed();

    for (const bit of [
      Permissions.MANAGE_SERVER,
      Permissions.KICK_MEMBERS,
      Permissions.BAN_MEMBERS,
      Permissions.CREATE_INVITE,
      Permissions.ADMINISTRATOR,
    ]) {
      const denied = await putRoleOverwrite(
        fixture.ada,
        fixture.channelId,
        fixture.everyoneRoleId,
        { deny: bit },
      );

      expect(denied.status).toBe(400);
      expect(denied.body).toMatchObject({
        error: { code: "NOT_A_CHANNEL_PERMISSION" },
      });

      const allowed = await putMemberOverwrite(
        fixture.ada,
        fixture.channelId,
        fixture.ada.id,
        { allow: bit },
      );

      expect(allowed.status).toBe(400);
      expect(allowed.body).toMatchObject({
        error: { code: "NOT_A_CHANNEL_PERMISSION" },
      });
    }

    expect(
      await db.query.channelRoleOverwrites.findMany({
        where: { channelId: fixture.channelId },
      }),
    ).toEqual([]);
  });

  it("accepts every channel-scoped bit", async () => {
    const fixture = await seed();

    const res = await putRoleOverwrite(
      fixture.ada,
      fixture.channelId,
      fixture.everyoneRoleId,
      {
        allow: Permissions.VIEW_CHANNEL | Permissions.MANAGE_MESSAGES,
        deny:
          Permissions.SEND_MESSAGES |
          Permissions.ADD_REACTIONS |
          Permissions.MENTION_EVERYONE |
          Permissions.MANAGE_CHANNELS |
          Permissions.MANAGE_ROLES,
      },
    );

    expect(res.status).toBe(200);
  });

  it("refuses a mixed mask rather than storing the legal half", async () => {
    const fixture = await seed();

    const res = await putRoleOverwrite(
      fixture.ada,
      fixture.channelId,
      fixture.everyoneRoleId,
      { deny: Permissions.SEND_MESSAGES | Permissions.BAN_MEMBERS },
    );

    expect(res.status).toBe(400);
    expect(
      await db.query.channelRoleOverwrites.findMany({
        where: { channelId: fixture.channelId },
      }),
    ).toEqual([]);
  });
});

describe("resolve() step 4, end to end", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("applies an @everyone deny to the channel and not to the server", async () => {
    const fixture = await seed();

    await putRoleOverwrite(
      fixture.ada,
      fixture.channelId,
      fixture.everyoneRoleId,
      { deny: Permissions.VIEW_CHANNEL },
    );

    expect((await getChannel(fixture.grace, fixture.channelId)).status).toBe(
      404,
    );

    const server = await request(app)
      .get(`/api/v1/servers/${fixture.serverId}`)
      .set("Cookie", fixture.grace.cookies);

    expect(server.status).toBe(200);
  });

  it("lets a member overwrite win over the role layer", async () => {
    const fixture = await seed();

    await putRoleOverwrite(
      fixture.ada,
      fixture.channelId,
      fixture.everyoneRoleId,
      { deny: Permissions.VIEW_CHANNEL },
    );

    expect((await getChannel(fixture.grace, fixture.channelId)).status).toBe(
      404,
    );

    await putMemberOverwrite(fixture.ada, fixture.channelId, fixture.grace.id, {
      allow: Permissions.VIEW_CHANNEL,
    });

    expect((await getChannel(fixture.grace, fixture.channelId)).status).toBe(
      200,
    );
  });

  it("never applies an overwrite to the owner", async () => {
    const fixture = await seed();

    await putMemberOverwrite(fixture.ada, fixture.channelId, fixture.ada.id, {
      deny: Permissions.VIEW_CHANNEL,
    });

    expect((await getChannel(fixture.ada, fixture.channelId)).status).toBe(200);
  });

  it("applies a non-default role's overwrite only to its holders", async () => {
    const fixture = await seed();

    const [role] = await db
      .insert(roles)
      .values({ serverId: fixture.serverId, name: "muted", position: 1 })
      .returning({ id: roles.id });

    const roleId = role?.id ?? "";

    await db.insert(memberRoles).values({
      serverId: fixture.serverId,
      userId: fixture.grace.id,
      roleId,
    });

    await putRoleOverwrite(fixture.ada, fixture.channelId, roleId, {
      deny: Permissions.VIEW_CHANNEL,
    });

    expect((await getChannel(fixture.grace, fixture.channelId)).status).toBe(
      404,
    );

    const hopper = await signUp("hopper");

    await db
      .insert(serverMembers)
      .values({ serverId: fixture.serverId, userId: hopper.id });

    expect((await getChannel(hopper, fixture.channelId)).status).toBe(200);
  });
});

describe("the overwrite composite foreign keys", () => {
  beforeAll(() => {
    requireTestDatabase();
  });

  it("refuses a role overwrite naming another server's role", async () => {
    const fixture = await seed();
    const other = await createServer(fixture.ada, "Difference Engine");
    const foreign = await db.query.roles.findFirst({
      columns: { id: true },
      where: { serverId: other, isDefault: true },
    });

    const error = await rejection(() =>
      db.insert(channelRoleOverwrites).values({
        channelId: fixture.channelId,
        serverId: fixture.serverId,
        roleId: foreign?.id ?? "",
      }),
    );

    expect(error.code).toBe(FOREIGN_KEY_VIOLATION);
    expect(error.constraint_name).toBe(
      "channel_role_overwrites_role_id_server_id_fkey",
    );
  });

  it("refuses a member overwrite for a non-member", async () => {
    const fixture = await seed();
    const stranger = await signUp("hopper");

    const error = await rejection(() =>
      db.insert(channelMemberOverwrites).values({
        channelId: fixture.channelId,
        serverId: fixture.serverId,
        userId: stranger.id,
      }),
    );

    expect(error.code).toBe(FOREIGN_KEY_VIOLATION);
    expect(error.constraint_name).toBe(
      "channel_member_overwrites_server_id_user_id_fkey",
    );
  });

  it("cascades overwrite rows when their role is deleted", async () => {
    const fixture = await seed();

    const [role] = await db
      .insert(roles)
      .values({ serverId: fixture.serverId, name: "muted", position: 1 })
      .returning({ id: roles.id });

    await db.insert(channelRoleOverwrites).values({
      channelId: fixture.channelId,
      serverId: fixture.serverId,
      roleId: role?.id ?? "",
    });

    await db.delete(roles).where(eq(roles.id, role?.id ?? ""));

    expect(await db.select().from(channelRoleOverwrites)).toEqual([]);
  });

  it("cascades overwrite rows when the member leaves", async () => {
    const fixture = await seed();

    await db.insert(channelMemberOverwrites).values({
      channelId: fixture.channelId,
      serverId: fixture.serverId,
      userId: fixture.grace.id,
    });

    await db
      .delete(serverMembers)
      .where(
        and(
          eq(serverMembers.serverId, fixture.serverId),
          eq(serverMembers.userId, fixture.grace.id),
        ),
      );

    expect(await db.select().from(channelMemberOverwrites)).toEqual([]);
  });
});
