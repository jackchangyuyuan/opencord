import { randomUUID } from "node:crypto";

import { Permissions } from "@opencord/shared/permissions";
import { sql } from "drizzle-orm";

import {
  createRandom,
  messageBody,
  timeline,
  topicFor,
} from "../../modules/demo/corpus.js";
import { COMMUNITY_SERVER_NAMES } from "../../modules/demo/dataset.js";
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

export const MEMBER_COUNT = 120;

const MODERATOR_COUNT = 4;

interface Holders {
  start: number;
  end: number;
  every: number;
}

interface RolePlan {
  name: string;
  color: number | null;
  permissions: number;
  holders: Holders;
}

const HQ_ROLES: RolePlan[] = [
  {
    name: "Contributor",
    color: null,
    permissions: EVERYONE_PERMISSIONS,
    holders: { start: 20, end: 100, every: 4 },
  },
  {
    name: "Designer",
    color: 0xec4899,
    permissions: EVERYONE_PERMISSIONS,
    holders: { start: 10, end: 70, every: 5 },
  },
  {
    name: "Developer",
    color: 0x3b82f6,
    permissions: EVERYONE_PERMISSIONS | Permissions.MENTION_EVERYONE,
    holders: { start: 8, end: 60, every: 3 },
  },
  {
    name: "Release Crew",
    color: 0xf59e0b,
    permissions: EVERYONE_PERMISSIONS | Permissions.MANAGE_MESSAGES,
    holders: { start: 2, end: 12, every: 3 },
  },
  {
    name: "Core",
    color: 0xe67e22,
    permissions: EVERYONE_PERMISSIONS,
    holders: { start: 0, end: 8, every: 1 },
  },
  {
    name: "Moderator",
    color: 0x5865f2,
    permissions: MODERATOR_PERMISSIONS,
    holders: { start: 0, end: MODERATOR_COUNT, every: 1 },
  },
];

const LOUNGE_ROLES: RolePlan[] = [
  {
    name: "Regular",
    color: null,
    permissions: EVERYONE_PERMISSIONS,
    holders: { start: 0, end: MEMBER_COUNT, every: 6 },
  },
  {
    name: "Event Host",
    color: 0x14b8a6,
    permissions: EVERYONE_PERMISSIONS | Permissions.MENTION_EVERYONE,
    holders: { start: 4, end: 10, every: 2 },
  },
  {
    name: "Moderator",
    color: 0x8b5cf6,
    permissions: MODERATOR_PERMISSIONS,
    holders: { start: 0, end: 2, every: 1 },
  },
];

function holdersOf(
  plan: RolePlan,
  people: readonly SeededUser[],
): SeededUser[] {
  const held: SeededUser[] = [];

  for (
    let index = plan.holders.start;
    index < Math.min(plan.holders.end, people.length);
    index += plan.holders.every
  ) {
    const person = people[index];

    if (person !== undefined) {
      held.push(person);
    }
  }

  return held;
}

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
        description: persona.description,
        customStatus: persona.customStatus,
        customStatusEmoji: persona.customStatusEmoji,
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
  roleIds: Map<string, string>;
  rolePlan: RolePlan[];
  channelIds: Map<string, string>;
}

async function createServer(
  name: string,
  owner: SeededUser,
  plan: ChannelPlan[],
  rolePlan: RolePlan[],
): Promise<SeededServer> {
  const [server] = await db
    .insert(servers)
    .values({ name, ownerId: owner.id, demoRole: "community" })
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
    ...rolePlan.map((entry, index) => ({
      serverId: server.id,
      name: entry.name,
      color: entry.color,
      permissions: entry.permissions,
      position: index + 1,
      isDefault: false,
    })),
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
    roleIds: new Map(rolePlan.map((entry) => [entry.name, roleId(entry.name)])),
    rolePlan,
    channelIds,
  };
}

async function joinEveryone(
  server: SeededServer,
  people: SeededUser[],
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

  const assignments = server.rolePlan.flatMap((entry) => {
    const roleId = server.roleIds.get(entry.name);

    return roleId === undefined
      ? []
      : holdersOf(entry, people).map((person) => ({
          serverId: server.id,
          userId: person.id,
          roleId,
        }));
  });

  for (let index = 0; index < assignments.length; index += BATCH) {
    await db
      .insert(memberRoles)
      .values(assignments.slice(index, index + BATCH))
      .onConflictDoNothing();
  }
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

  const hq = await createServer(
    COMMUNITY_SERVER_NAMES[0],
    owner,
    HQ_CHANNELS,
    HQ_ROLES,
  );
  const lounge = await createServer(
    COMMUNITY_SERVER_NAMES[1],
    owner,
    LOUNGE_CHANNELS,
    LOUNGE_ROLES,
  );

  for (const server of [hq, lounge]) {
    await joinEveryone(server, people);
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
