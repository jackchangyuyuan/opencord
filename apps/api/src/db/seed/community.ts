import { randomUUID } from "node:crypto";

import { Permissions } from "@opencord/shared/permissions";
import { eq, sql } from "drizzle-orm";

import { db } from "../index.js";
import {
  auditLog,
  channelRoleOverwrites,
  channels,
  memberRoles,
  messages,
  roles,
  serverMembers,
  servers,
  users,
} from "../schema/index.js";
import { createRandom, messageBody, timeline, topicFor } from "./corpus.js";
import { type Persona, personasFor } from "./personas.js";

const BATCH = 2000;

const EVERYONE_PERMISSIONS =
  Permissions.VIEW_CHANNEL |
  Permissions.SEND_MESSAGES |
  Permissions.ADD_REACTIONS |
  Permissions.CREATE_INVITE;

const MODERATOR_PERMISSIONS =
  EVERYONE_PERMISSIONS |
  Permissions.MANAGE_MESSAGES |
  Permissions.KICK_MEMBERS |
  Permissions.MANAGE_CHANNELS;

export const COMMUNITY_SERVER_NAMES = ["OpenCord HQ", "The Lounge"] as const;

export const MEMBER_COUNT = 120;

const MODERATOR_COUNT = 4;

interface ChannelPlan {
  name: string;
  topic: string;
  share: number;
  private?: boolean;
}

const HQ_CHANNELS: ChannelPlan[] = [
  { name: "general", topic: "Everything and nothing", share: 0.34 },
  { name: "engineering", topic: "How it is built", share: 0.4 },
  { name: "design", topic: "How it looks", share: 0.12 },
  { name: "support", topic: "When it breaks", share: 0.06 },
  { name: "announcements", topic: "Rarely, but read it", share: 0.01 },
  { name: "core-team", topic: "Not for everyone", share: 0.02, private: true },
];

const LOUNGE_CHANNELS: ChannelPlan[] = [
  { name: "random", topic: "Off topic on purpose", share: 0.04 },
  { name: "general", topic: "Say hello", share: 0.01 },
];

export interface SeededUser extends Persona {
  id: string;
}

export async function createPersonaUsers(count: number): Promise<SeededUser[]> {
  const seeded = (await personasFor(count)).map((persona) => ({
    ...persona,
    id: randomUUID(),
  }));

  for (let index = 0; index < seeded.length; index += BATCH) {
    await db.insert(users).values(
      seeded.slice(index, index + BATCH).map((persona) => ({
        id: persona.id,
        name: persona.name,
        email: persona.email,
        emailVerified: true,
        username: persona.username,
        image: persona.image,
      })),
    );
  }

  return seeded;
}

interface InsertedMessage {
  channelId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  mentionsEveryone: boolean;
}

// PostgreSQL 18's uuidv7 takes a shift interval, so each id is minted as if the
// clock were at the row's own timestamp and id order agrees with timestamp order
// by construction. The shift is measured against clock_timestamp(), not now():
// now() is fixed for the whole statement, so a 2000-row batch would push its
// later rows into the future and let one channel's tail overtake another's head.
async function insertMessages(rows: InsertedMessage[]): Promise<void> {
  for (let index = 0; index < rows.length; index += BATCH) {
    const batch = rows.slice(index, index + BATCH);

    await db.insert(messages).values(
      batch.map((row) => ({
        id: sql<string>`uuidv7(${row.createdAt.toISOString()}::timestamptz - clock_timestamp())`,
        channelId: row.channelId,
        authorId: row.authorId,
        content: row.content,
        createdAt: row.createdAt,
        mentionsEveryone: row.mentionsEveryone,
      })),
    );
  }
}

export async function repairWatermarks(): Promise<void> {
  await db.execute(sql`
    with newest as (
      select distinct on (channel_id) channel_id, id
        from messages
       where deleted_at is null
       order by channel_id, id desc
    ),
    newest_everyone as (
      select distinct on (channel_id) channel_id, id
        from messages
       where deleted_at is null and mentions_everyone
       order by channel_id, id desc
    )
    update channels c
       set last_message_id = n.id,
           last_everyone_mention_id = e.id
      from newest n
      left join newest_everyone e on e.channel_id = n.channel_id
     where n.channel_id = c.id
  `);
}

interface SeededServer {
  id: string;
  everyoneRoleId: string;
  moderatorRoleId: string;
  channelIds: Map<string, string>;
}

async function createServer(
  name: string,
  owner: SeededUser,
  plan: ChannelPlan[],
): Promise<SeededServer> {
  const [server] = await db
    .insert(servers)
    .values({ name, ownerId: owner.id })
    .returning({ id: servers.id });

  if (server === undefined) {
    throw new Error(`could not create ${name}`);
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
    {
      serverId: server.id,
      name: "Moderator",
      color: 0x5865f2,
      permissions: MODERATOR_PERMISSIONS,
      position: 1,
      isDefault: false,
    },
    {
      serverId: server.id,
      name: "Core",
      color: 0xe67e22,
      permissions: EVERYONE_PERMISSIONS,
      position: 2,
      isDefault: false,
    },
  ];

  const inserted = await db
    .insert(roles)
    .values(roleRows)
    .returning({ id: roles.id, name: roles.name });

  const roleId = (roleName: string): string => {
    const found = inserted.find((role) => role.name === roleName);

    if (found === undefined) {
      throw new Error(`the ${roleName} role was not created`);
    }

    return found.id;
  };

  const channelRows = await db
    .insert(channels)
    .values(
      plan.map((entry, position) => ({
        serverId: server.id,
        type: "text" as const,
        name: entry.name,
        topic: entry.topic,
        position,
      })),
    )
    .returning({ id: channels.id, name: channels.name });

  const channelIds = new Map(
    channelRows.flatMap((row) =>
      row.name === null ? [] : [[row.name, row.id]],
    ),
  );

  for (const entry of plan.filter((candidate) => candidate.private === true)) {
    const channelId = channelIds.get(entry.name);

    if (channelId === undefined) {
      continue;
    }

    await db.insert(channelRoleOverwrites).values([
      {
        channelId,
        serverId: server.id,
        roleId: roleId("@everyone"),
        allow: 0,
        deny: Permissions.VIEW_CHANNEL,
      },
      {
        channelId,
        serverId: server.id,
        roleId: roleId("Core"),
        allow: Permissions.VIEW_CHANNEL,
        deny: 0,
      },
    ]);
  }

  return {
    id: server.id,
    everyoneRoleId: roleId("@everyone"),
    moderatorRoleId: roleId("Moderator"),
    channelIds,
  };
}

async function joinEveryone(
  server: SeededServer,
  people: SeededUser[],
  coreRoleId: string,
): Promise<void> {
  for (let index = 0; index < people.length; index += BATCH) {
    await db
      .insert(serverMembers)
      .values(
        people
          .slice(index, index + BATCH)
          .map((person) => ({ serverId: server.id, userId: person.id })),
      )
      .onConflictDoNothing();
  }

  const moderators = people.slice(0, MODERATOR_COUNT);
  const core = people.slice(0, 8);

  await db.insert(memberRoles).values([
    ...moderators.map((person) => ({
      serverId: server.id,
      userId: person.id,
      roleId: server.moderatorRoleId,
    })),
    ...core.map((person) => ({
      serverId: server.id,
      userId: person.id,
      roleId: coreRoleId,
    })),
  ]);
}

async function writeAuditTrail(
  server: SeededServer,
  people: SeededUser[],
): Promise<void> {
  const [actor, target] = people;

  if (actor === undefined || target === undefined) {
    return;
  }

  await db.insert(auditLog).values([
    {
      serverId: server.id,
      actorId: actor.id,
      action: "server_update",
      targetType: "server",
      targetId: server.id,
      metadata: { name: "renamed at launch" },
    },
    {
      serverId: server.id,
      actorId: actor.id,
      action: "role_create",
      targetType: "role",
      targetId: server.moderatorRoleId,
      metadata: { name: "Moderator" },
    },
    {
      serverId: server.id,
      actorId: actor.id,
      action: "member_kick",
      targetType: "user",
      targetId: target.id,
      metadata: { reason: "spam" },
    },
  ]);
}

export interface SeededChannel {
  channelId: string;
  name: string;
}

export interface CommunityResult {
  people: SeededUser[];
  moderators: SeededUser[];
  serverIds: string[];
  channels: SeededChannel[];
  messageCount: number;
  newestAt: Date;
}

export async function seedCommunity(
  messageCount: number,
): Promise<CommunityResult> {
  const random = createRandom(20260913);
  const people = await createPersonaUsers(MEMBER_COUNT);
  const [owner] = people;

  if (owner === undefined) {
    throw new Error("the persona list is empty");
  }

  const hq = await createServer(COMMUNITY_SERVER_NAMES[0], owner, HQ_CHANNELS);
  const lounge = await createServer(
    COMMUNITY_SERVER_NAMES[1],
    owner,
    LOUNGE_CHANNELS,
  );

  const coreRoles = await db
    .select({ id: roles.id, serverId: roles.serverId })
    .from(roles)
    .where(eq(roles.name, "Core"));

  for (const server of [hq, lounge]) {
    const core = coreRoles.find((role) => role.serverId === server.id);

    await joinEveryone(server, people, core?.id ?? server.moderatorRoleId);
    await writeAuditTrail(server, people);
  }

  const endMs = Date.now() - 60 * 60 * 1000;
  const startMs = endMs - 640 * 24 * 60 * 60 * 1000;

  const plans: [SeededServer, ChannelPlan[]][] = [
    [hq, HQ_CHANNELS],
    [lounge, LOUNGE_CHANNELS],
  ];

  const seededChannels: SeededChannel[] = [];
  let written = 0;

  for (const [server, plan] of plans) {
    for (const entry of plan) {
      const channelId = server.channelIds.get(entry.name);

      if (channelId === undefined) {
        continue;
      }

      seededChannels.push({ channelId, name: entry.name });

      const topic = topicFor(entry.name);
      const count = Math.max(Math.round(messageCount * entry.share), 1);
      const stamps = timeline(count, startMs, endMs, random);

      const rows = stamps.map((at, index) => {
        const author = random.pick(people);

        const broadcast = entry.name === "announcements" && index === count - 1;

        return {
          channelId,
          authorId: author.id,
          content: broadcast
            ? "@everyone the next release ships on Friday. Read the changelog."
            : messageBody(random, topic),
          createdAt: new Date(at),
          mentionsEveryone: broadcast,
        };
      });

      await insertMessages(rows);
      written += rows.length;
    }
  }

  await repairWatermarks();

  return {
    people,
    moderators: people.slice(0, MODERATOR_COUNT),
    serverIds: [hq.id, lounge.id],
    channels: seededChannels,
    messageCount: written,
    newestAt: new Date(endMs),
  };
}
