import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "../../src/db/index.js";
import {
  channelRoleOverwrites,
  channels,
  memberRoles,
  messages,
  roles,
  serverMembers,
  servers,
  users,
} from "../../src/db/schema/index.js";
import { cloneSandbox } from "../../src/modules/demo/queries.js";
import { requireTestDatabase } from "../setup.js";

async function seedUser(label: string): Promise<string> {
  const id = `${label}-${randomUUID().slice(0, 8)}`;

  await db.insert(users).values({
    id,
    name: label,
    email: `${id}@example.com`,
    username: id,
  });

  return id;
}

async function seedTemplate(ownerId: string) {
  const [server] = await db
    .insert(servers)
    .values({ name: "Twins", ownerId })
    .returning({ id: servers.id });

  const serverId = server?.id ?? "";

  const roleRows = await db
    .insert(roles)
    .values([
      { serverId, name: "@everyone", position: 0, isDefault: true },
      { serverId, name: "Staff", permissions: 1, position: 1 },
      { serverId, name: "Staff", permissions: 2, position: 2 },
    ])
    .returning({ id: roles.id, permissions: roles.permissions });

  const channelRows = await db
    .insert(channels)
    .values([
      { serverId, type: "text" as const, name: "general", position: 0 },
      { serverId, type: "text" as const, name: "general", position: 1 },
    ])
    .returning({ id: channels.id, position: channels.position });

  const [, first, second] = roleRows;
  const [firstChannel, secondChannel] = channelRows;

  await db.insert(messages).values([
    { channelId: firstChannel?.id ?? "", authorId: ownerId, content: "in one" },
    {
      channelId: secondChannel?.id ?? "",
      authorId: ownerId,
      content: "in two",
    },
  ]);

  await db.insert(channelRoleOverwrites).values([
    {
      channelId: firstChannel?.id ?? "",
      serverId,
      roleId: first?.id ?? "",
      allow: 0,
      deny: 1,
    },
    {
      channelId: secondChannel?.id ?? "",
      serverId,
      roleId: second?.id ?? "",
      allow: 0,
      deny: 2,
    },
  ]);

  const member = await seedUser("member");

  await db.insert(serverMembers).values({ serverId, userId: member });
  await db
    .insert(memberRoles)
    .values({ serverId, userId: member, roleId: second?.id ?? "" });

  return { serverId, member };
}

describe("cloning the sandbox template", () => {
  beforeAll(requireTestDatabase);

  it("keeps rows apart when roles and channels share a name", async () => {
    const templateOwner = await seedUser("template-owner");
    const visitor = await seedUser("visitor");
    const template = await seedTemplate(templateOwner);

    const clone = await db.transaction((tx) =>
      cloneSandbox(tx, template.serverId, visitor),
    );

    expect(clone.channelIds).toHaveLength(2);

    const copied = await db
      .select({ channelId: messages.channelId, content: messages.content })
      .from(messages)
      .innerJoin(channels, eq(channels.id, messages.channelId))
      .where(eq(channels.serverId, clone.serverId));

    expect(copied.map((row) => row.content).toSorted()).toEqual([
      "in one",
      "in two",
    ]);
    expect(new Set(copied.map((row) => row.channelId)).size).toBe(2);

    const overwrites = await db
      .select({
        deny: channelRoleOverwrites.deny,
        position: channels.position,
        permissions: roles.permissions,
        roleId: channelRoleOverwrites.roleId,
      })
      .from(channelRoleOverwrites)
      .innerJoin(channels, eq(channels.id, channelRoleOverwrites.channelId))
      .innerJoin(roles, eq(roles.id, channelRoleOverwrites.roleId))
      .where(eq(channelRoleOverwrites.serverId, clone.serverId));

    expect(overwrites).toHaveLength(2);
    expect(new Set(overwrites.map((row) => row.roleId)).size).toBe(2);

    expect(
      overwrites
        .map((row) => ({
          deny: row.deny,
          position: row.position,
          permissions: row.permissions,
        }))
        .toSorted((left, right) => left.deny - right.deny),
    ).toEqual([
      { deny: 1, position: 0, permissions: 1 },
      { deny: 2, position: 1, permissions: 2 },
    ]);

    const assignments = await db
      .select({ roleId: memberRoles.roleId })
      .from(memberRoles)
      .where(eq(memberRoles.serverId, clone.serverId));

    expect(assignments).toHaveLength(1);

    const assigned = await db.query.roles.findFirst({
      columns: { permissions: true },
      where: { id: assignments[0]?.roleId ?? "" },
    });

    expect(assigned?.permissions).toBe(2);
  });
});
