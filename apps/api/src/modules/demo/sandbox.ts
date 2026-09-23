import { Permissions } from "@opencord/shared/permissions";
import { sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import {
  channelRoleOverwrites,
  channels,
  memberRoles,
  messages,
  roles,
  serverMembers,
  servers,
} from "../../db/schema/index.js";
import { createRandom, messageBody, timeline, topicFor } from "./corpus.js";
import { SANDBOX_TEMPLATE_NAME } from "./dataset.js";
import type { Executor, SeededUser } from "./provision.js";

export const SANDBOX_MEMBER_COUNT = 6;
export const SANDBOX_MESSAGE_COUNT = 48;

const EVERYONE_PERMISSIONS =
  Permissions.VIEW_CHANNEL |
  Permissions.SEND_MESSAGES |
  Permissions.ADD_REACTIONS |
  Permissions.CREATE_INVITE;

export const SANDBOX_CHANNELS = [
  { name: "general", topic: "Start here" },
  { name: "ideas", topic: "Half-formed is fine" },
  { name: "staff-only", topic: "Try the overwrite editor on this one" },
] as const;

export const SANDBOX_PRIVATE_CHANNEL = "staff-only";

export const SANDBOX_ROLES = [
  { name: "Contributor", color: 0x2ecc71, position: 1 },
  { name: "Moderator", color: 0x5865f2, position: 2 },
] as const;

export interface SandboxTemplate {
  serverId: string;
}

export async function seedSandboxTemplate(
  people: SeededUser[],
  executor: Executor = db,
): Promise<SandboxTemplate> {
  const random = createRandom(915);
  const [owner] = people;

  if (owner === undefined) {
    throw new Error("the persona list is empty");
  }

  const [server] = await executor
    .insert(servers)
    .values({
      name: SANDBOX_TEMPLATE_NAME,
      ownerId: owner.id,
      demoRole: "template",
    })
    .returning({ id: servers.id });

  if (server === undefined) {
    throw new Error("could not create the sandbox template");
  }

  const roleRows: (typeof roles.$inferInsert)[] = [
    {
      serverId: server.id,
      name: "@everyone",
      color: null,
      permissions: EVERYONE_PERMISSIONS,
      position: 0,
      isDefault: true,
    },
    ...SANDBOX_ROLES.map((role) => ({
      serverId: server.id,
      name: role.name,
      color: role.color,
      permissions: EVERYONE_PERMISSIONS,
      position: role.position,
      isDefault: false,
    })),
  ];

  const insertedRoles = await executor
    .insert(roles)
    .values(roleRows)
    .returning({ id: roles.id, name: roles.name });

  const everyoneRole = insertedRoles.find((role) => role.name === "@everyone");

  if (everyoneRole === undefined) {
    throw new Error("the sandbox template has no @everyone role");
  }

  const insertedChannels = await executor
    .insert(channels)
    .values(
      SANDBOX_CHANNELS.map((channel, position) => ({
        serverId: server.id,
        type: "text" as const,
        name: channel.name,
        topic: channel.topic,
        position,
      })),
    )
    .returning({ id: channels.id, name: channels.name });

  const privateChannel = insertedChannels.find(
    (channel) => channel.name === SANDBOX_PRIVATE_CHANNEL,
  );

  if (privateChannel !== undefined) {
    await executor.insert(channelRoleOverwrites).values({
      channelId: privateChannel.id,
      serverId: server.id,
      roleId: everyoneRole.id,
      allow: 0,
      deny: Permissions.VIEW_CHANNEL,
    });
  }

  const members = people.slice(0, SANDBOX_MEMBER_COUNT);

  await executor
    .insert(serverMembers)
    .values(
      members.map((person) => ({ serverId: server.id, userId: person.id })),
    )
    .onConflictDoNothing();

  const contributor = insertedRoles.find((role) => role.name === "Contributor");

  if (contributor !== undefined) {
    await executor.insert(memberRoles).values(
      members.slice(1, 4).map((person) => ({
        serverId: server.id,
        userId: person.id,
        roleId: contributor.id,
      })),
    );
  }

  const endMs = Date.now() - 5 * 60 * 1000;
  const startMs = endMs - 14 * 24 * 60 * 60 * 1000;
  const perChannel = Math.ceil(SANDBOX_MESSAGE_COUNT / insertedChannels.length);

  for (const channel of insertedChannels) {
    const topic = topicFor(channel.name ?? "general");

    await executor.insert(messages).values(
      timeline(perChannel, startMs, endMs, random).map((at) => ({
        id: sql<string>`uuidv7(${new Date(at).toISOString()}::timestamptz - clock_timestamp())`,
        channelId: channel.id,
        authorId: random.pick(members).id,
        content: messageBody(random, topic),
        createdAt: new Date(at),
      })),
    );
  }

  await executor.execute(sql`
    with newest as (
      select distinct on (channel_id) channel_id, id
        from messages
       where deleted_at is null
       order by channel_id, id desc
    )
    update channels c
       set last_message_id = n.id
      from newest n
     where n.channel_id = c.id and c.server_id = ${server.id}::uuid
  `);

  return { serverId: server.id };
}
