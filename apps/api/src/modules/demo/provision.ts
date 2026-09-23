import { randomUUID } from "node:crypto";

import { Permissions } from "@opencord/shared/permissions";
import { sql } from "drizzle-orm";

import { db, type Transaction } from "../../db/index.js";
import {
  auditLog,
  bans,
  channelRoleOverwrites,
  channels,
  invites,
  memberRoles,
  mentions,
  messages,
  roles,
  serverMembers,
  servers,
  users,
} from "../../db/schema/index.js";
import { seedDensity } from "../../db/seed/density.js";
import { lockDemoProvisioning } from "../../lib/advisory-locks.js";
import {
  type ChannelPlan,
  EVERYONE_PERMISSIONS,
  type RolePlan,
  type ServerPlan,
  SERVERS,
} from "./catalogue.js";
import { type Beat, type Exchange, EXCHANGES } from "./conversations.js";
import {
  createRandom,
  messageBody,
  type Random,
  timeline,
  topicFor,
} from "./corpus.js";
import { type Persona, personasFor } from "./personas.js";
import { seedSandboxTemplate } from "./sandbox.js";

export type Executor = Transaction | typeof db;

const BATCH = 2000;

const CORPUS_SEED = 20260913;

const DAY_MS = 24 * 60 * 60 * 1000;

export const MEMBER_COUNT = 140;

const MODERATOR_COUNT = 4;

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

export interface SeededUser extends Persona {
  id: string;
}

export async function createPersonaUsers(
  count: number,
  executor: Executor = db,
): Promise<SeededUser[]> {
  const seeded = (await personasFor(count)).map((persona) => ({
    ...persona,
    id: randomUUID(),
  }));

  for (let index = 0; index < seeded.length; index += BATCH) {
    await executor.insert(users).values(
      seeded.slice(index, index + BATCH).map((persona) => ({
        id: persona.id,
        name: persona.name,
        email: persona.email,
        emailVerified: true,
        image: persona.image,
        username: persona.username,
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
  pinnedAt?: Date;
  pinnedBy?: string;
  editedAt?: Date;
  // Index into the same batch, resolved to an id once the rows come back.
  replyToIndex?: number;
  mentioned?: string[];
}

// PostgreSQL 18's uuidv7 takes a shift interval, so each id is minted as if the
// clock were at the row's own timestamp and id order agrees with timestamp order
// by construction. The shift is measured against clock_timestamp(), not now():
// now() is fixed for the whole statement, so a 2000-row batch would push its
// later rows into the future and let one channel's tail overtake another's head.
function messageValues(row: InsertedMessage) {
  return {
    id: sql<string>`uuidv7(${row.createdAt.toISOString()}::timestamptz - clock_timestamp())`,
    channelId: row.channelId,
    authorId: row.authorId,
    content: row.content,
    createdAt: row.createdAt,
    mentionsEveryone: row.mentionsEveryone,
    ...(row.pinnedAt === undefined ? {} : { pinnedAt: row.pinnedAt }),
    ...(row.pinnedBy === undefined ? {} : { pinnedBy: row.pinnedBy }),
    ...(row.editedAt === undefined ? {} : { editedAt: row.editedAt }),
  };
}

// One writer for both the generated backlog and the curated exchanges. Ids come
// back from RETURNING in the order of the VALUES list, which is what lets a
// batch-local index stand in for an id while the rows are still being built --
// a reply points at a sibling, and a mention needs a row of its own before the
// recipient sees a badge.
async function writeMessages(
  rows: InsertedMessage[],
  executor: Executor = db,
): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH) {
    const chunk = rows.slice(start, start + BATCH);

    const inserted = await executor
      .insert(messages)
      .values(chunk.map(messageValues))
      .returning({ id: messages.id, channelId: messages.channelId });

    const replies = chunk.flatMap((row, index) => {
      const target = row.replyToIndex;
      const self = inserted[index];

      if (target === undefined || self === undefined) {
        return [];
      }

      const parent = inserted[target];

      return parent === undefined ? [] : [{ id: self.id, replyTo: parent.id }];
    });

    if (replies.length > 0) {
      const pairs = sql.join(
        replies.map((pair) => sql`(${pair.id}::uuid, ${pair.replyTo}::uuid)`),
        sql`, `,
      );

      await executor.execute(sql`
        update messages m
           set reply_to_id = v.reply_to_id
          from (values ${pairs}) as v(id, reply_to_id)
         where m.id = v.id
      `);
    }

    const mentionRows = chunk.flatMap((row, index) => {
      const self = inserted[index];

      return self === undefined
        ? []
        : (row.mentioned ?? []).map((userId) => ({
            userId,
            messageId: self.id,
            channelId: self.channelId,
          }));
    });

    if (mentionRows.length > 0) {
      await executor.insert(mentions).values(mentionRows).onConflictDoNothing();
    }
  }
}

export async function repairWatermarks(executor: Executor = db): Promise<void> {
  await executor.execute(sql`
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
  plan: ServerPlan;
  id: string;
  createdAt: Date;
  members: SeededUser[];
  moderators: SeededUser[];
  roleIds: Map<string, string>;
  channelIds: Map<string, string>;
}

async function createServer(
  plan: ServerPlan,
  owner: SeededUser,
  createdAt: Date,
  executor: Executor = db,
): Promise<{
  id: string;
  roleIds: Map<string, string>;
  channelIds: Map<string, string>;
}> {
  const [server] = await executor
    .insert(servers)
    .values({
      name: plan.name,
      description: plan.description,
      ownerId: owner.id,
      demoRole: "community",
      createdAt,
    })
    .returning({ id: servers.id });

  if (server === undefined) {
    throw new Error(`could not create ${plan.name}`);
  }

  const inserted = await executor
    .insert(roles)
    .values([
      {
        serverId: server.id,
        name: "@everyone",
        color: null,
        permissions: EVERYONE_PERMISSIONS,
        position: 0,
        isDefault: true,
      },
      ...plan.roles.map((entry, index) => ({
        serverId: server.id,
        name: entry.name,
        color: entry.color,
        permissions: entry.permissions,
        position: index + 1,
        isDefault: false,
      })),
    ])
    .returning({ id: roles.id, name: roles.name });

  const roleIds = new Map(inserted.map((role) => [role.name, role.id]));

  const channelRows = await executor
    .insert(channels)
    .values(
      plan.channels.map((entry, position) => ({
        serverId: server.id,
        type: "text" as const,
        name: entry.name,
        topic: entry.topic,
        position,
        createdAt,
      })),
    )
    .returning({ id: channels.id, name: channels.name });

  const channelIds = new Map(
    channelRows.flatMap((row) =>
      row.name === null ? [] : [[row.name, row.id]],
    ),
  );

  for (const entry of plan.channels) {
    const restricted = entry.privateTo;
    const channelId = channelIds.get(entry.name);
    const everyoneId = roleIds.get("@everyone");
    const allowedId =
      restricted === undefined ? undefined : roleIds.get(restricted);

    if (
      restricted === undefined ||
      channelId === undefined ||
      everyoneId === undefined ||
      allowedId === undefined
    ) {
      continue;
    }

    await executor.insert(channelRoleOverwrites).values([
      {
        channelId,
        serverId: server.id,
        roleId: everyoneId,
        allow: 0,
        deny: Permissions.VIEW_CHANNEL,
      },
      {
        channelId,
        serverId: server.id,
        roleId: allowedId,
        allow: Permissions.VIEW_CHANNEL,
        deny: 0,
      },
    ]);
  }

  return { id: server.id, roleIds, channelIds };
}

// Join dates are spread across the server's life rather than stamped at
// creation: a member list where everyone joined in the same second reads as a
// fixture, and the profile card shows the date.
async function joinMembers(
  serverId: string,
  createdAt: Date,
  people: SeededUser[],
  plan: ServerPlan,
  roleIds: Map<string, string>,
  random: Random,
  executor: Executor = db,
): Promise<void> {
  const span = Date.now() - createdAt.getTime();

  for (let index = 0; index < people.length; index += BATCH) {
    await executor
      .insert(serverMembers)
      .values(
        people.slice(index, index + BATCH).map((person, offset) => ({
          serverId,
          userId: person.id,
          joinedAt: new Date(
            createdAt.getTime() +
              Math.min(
                span - 1,
                Math.round(((index + offset) / people.length) * span * 0.9) +
                  random.int(Math.max(Math.round(span * 0.05), 1)),
              ),
          ),
        })),
      )
      .onConflictDoNothing();
  }

  const assignments = plan.roles.flatMap((entry) => {
    const roleId = roleIds.get(entry.name);

    return roleId === undefined
      ? []
      : holdersOf(entry, people).map((person) => ({
          serverId,
          userId: person.id,
          roleId,
        }));
  });

  for (let index = 0; index < assignments.length; index += BATCH) {
    await executor
      .insert(memberRoles)
      .values(assignments.slice(index, index + BATCH))
      .onConflictDoNothing();
  }
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

function membersFor(plan: ServerPlan, people: SeededUser[]): SeededUser[] {
  const wanted = Math.max(Math.round(people.length * plan.memberShare), 1);

  return people.slice(0, wanted);
}

// One exchange is cast from the members who are actually in the channel, and
// the same slot always resolves to the same person for the length of the
// conversation, which is what makes it read as a conversation.
function castFor(
  exchange: { cast: number },
  members: readonly SeededUser[],
  random: Random,
): SeededUser[] {
  const chosen: SeededUser[] = [];
  const taken = new Set<string>();

  while (chosen.length < exchange.cast && taken.size < members.length) {
    const person = random.pick(members);

    if (!taken.has(person.id)) {
      taken.add(person.id);
      chosen.push(person);
    }
  }

  return chosen;
}

function renderBeat(
  beat: Beat,
  cast: readonly SeededUser[],
): { content: string; mentioned: string[] } {
  const mentioned: string[] = [];

  const content = beat.text.replaceAll(/\{(\d+)\}/g, (literal, raw: string) => {
    const person = cast[Number(raw)];

    if (person === undefined) {
      return literal;
    }

    mentioned.push(person.id);

    return `<@${person.id}>`;
  });

  return { content, mentioned };
}

interface ChannelFill {
  generated: InsertedMessage[];
  curated: InsertedMessage[];
}

const BEAT_GAP_MS = 2 * 60 * 1000;

// A channel name repeats across servers -- five of them have a #general -- so
// an exchange is spent when it is used and only reused once the theme runs dry.
// Without this the same conversation appears in every server.
function claimExchanges(
  theme: string,
  wanted: number,
  used: Set<Exchange>,
  random: Random,
): Exchange[] {
  const matching = EXCHANGES.filter((exchange) => exchange.theme === theme);

  if (matching.length === 0) {
    return [];
  }

  const claimed: Exchange[] = [];

  while (claimed.length < wanted) {
    const fresh = matching.filter(
      (exchange) => !used.has(exchange) && !claimed.includes(exchange),
    );
    const pool = fresh.length > 0 ? fresh : matching;
    const chosen = random.pick(pool);

    if (claimed.includes(chosen)) {
      break;
    }

    used.add(chosen);
    claimed.push(chosen);
  }

  return claimed;
}

const BACKLOG_MENTION_SHARE = 0.05;

function fillChannel(
  channelId: string,
  entry: ChannelPlan,
  members: SeededUser[],
  moderators: SeededUser[],
  count: number,
  startMs: number,
  endMs: number,
  random: Random,
  used: Set<Exchange>,
): ChannelFill {
  // A busy channel carries two exchanges so its newest screenful is not one
  // conversation surrounded by backlog.
  const claimed = claimExchanges(
    entry.name,
    count >= 240 ? 2 : 1,
    used,
    random,
  );

  const beats = claimed.flatMap((exchange) => exchange.beats);
  const curatedCount = Math.min(beats.length, Math.max(count - 1, 0));
  const generatedCount = Math.max(count - curatedCount, 0);

  const topic = topicFor(entry.name);
  const spoken: string[] = [];

  // The curated tail occupies the last stretch of the window; the generated
  // backlog fills everything before it.
  const tailMs = beats.reduce(
    (total, beat) => total + (beat.gap ?? 2) * 60 * 1000,
    0,
  );
  const curatedStart = Math.max(endMs - tailMs - BEAT_GAP_MS, startMs + 1);

  const generated = timeline(
    generatedCount,
    startMs,
    curatedStart,
    random,
  ).map<InsertedMessage>((at, index) => {
    const broadcast =
      entry.name === "announcements" && index === generatedCount - 1;

    if (broadcast) {
      return {
        channelId,
        authorId: random.pick(members).id,
        content:
          "@everyone the next release ships on Friday. Read the changelog — it is two lines this time.",
        createdAt: new Date(at),
        mentionsEveryone: true,
      };
    }

    // A backlog with no mentions in it reads as generated however good the
    // sentences are, and the mention row is what puts a badge on the channel.
    const addressed =
      members.length > 1 && random.next() < BACKLOG_MENTION_SHARE
        ? random.pick(members)
        : undefined;

    const body = messageBody(random, topic, spoken);

    return {
      channelId,
      authorId: random.pick(members).id,
      content: addressed === undefined ? body : `<@${addressed.id}> ${body}`,
      createdAt: new Date(at),
      mentionsEveryone: false,
      ...(addressed === undefined ? {} : { mentioned: [addressed.id] }),
    };
  });

  if (claimed.length === 0 || curatedCount === 0) {
    return { generated, curated: [] };
  }

  const pinner = moderators[0] ?? members[0];

  let at = curatedStart;
  let consumed = 0;

  const casts = claimed.map((exchange) => castFor(exchange, members, random));

  const curated = beats.slice(0, curatedCount).map<InsertedMessage>((beat) => {
    // Beats are concatenated across the claimed exchanges; the cast and the
    // reply offsets both have to follow the exchange the beat came from.
    let group = 0;
    let base = 0;

    for (const [index, exchange] of claimed.entries()) {
      if (consumed < base + exchange.beats.length) {
        group = index;
        break;
      }

      base += exchange.beats.length;
    }

    const cast = casts[group] ?? [];
    const offset = base;

    consumed += 1;

    at += (beat.gap ?? 2) * 60 * 1000;

    const speaker = cast[beat.speaker] ?? random.pick(members);
    const { content, mentioned } = renderBeat(beat, cast);

    return {
      channelId,
      authorId: speaker.id,
      content,
      createdAt: new Date(Math.min(at, endMs)),
      mentionsEveryone: false,
      mentioned,
      ...(beat.replyTo === undefined
        ? {}
        : { replyToIndex: offset + beat.replyTo }),
      ...(beat.edited === true
        ? { editedAt: new Date(Math.min(at + 4 * 60 * 1000, endMs)) }
        : {}),
      ...(beat.pinned === true && pinner !== undefined
        ? {
            pinnedAt: new Date(Math.min(at + 60 * 1000, endMs)),
            pinnedBy: pinner.id,
          }
        : {}),
    };
  });

  return { generated, curated };
}

export async function seedCommunity(
  messageCount: number,
  memberCount: number = MEMBER_COUNT,
  executor: Executor = db,
): Promise<CommunityResult> {
  const random = createRandom(CORPUS_SEED);
  const people = await createPersonaUsers(memberCount, executor);
  const [owner] = people;

  if (owner === undefined) {
    throw new Error("the persona list is empty");
  }

  const endMs = Date.now() - 60 * 60 * 1000;
  const seeded: SeededServer[] = [];

  for (const plan of SERVERS) {
    const createdAt = new Date(endMs - plan.ageDays * DAY_MS);
    const { id, roleIds, channelIds } = await createServer(
      plan,
      owner,
      createdAt,
      executor,
    );

    const members = membersFor(plan, people);

    await joinMembers(id, createdAt, members, plan, roleIds, random, executor);

    seeded.push({
      plan,
      id,
      createdAt,
      members,
      moderators: members.slice(0, MODERATOR_COUNT),
      roleIds,
      channelIds,
    });
  }

  const seededChannels: SeededChannel[] = [];
  const usedExchanges = new Set<Exchange>();
  let written = 0;

  for (const server of seeded) {
    const budget = Math.max(
      Math.round(messageCount * server.plan.share),
      server.plan.channels.length,
    );

    for (const entry of server.plan.channels) {
      const channelId = server.channelIds.get(entry.name);

      if (channelId === undefined) {
        continue;
      }

      seededChannels.push({ channelId, name: entry.name });

      const count = Math.max(Math.round(budget * entry.share), 1);
      const fill = fillChannel(
        channelId,
        entry,
        server.members,
        server.moderators,
        count,
        server.createdAt.getTime(),
        endMs,
        random,
        usedExchanges,
      );

      await writeMessages(fill.generated, executor);
      await writeMessages(fill.curated, executor);

      written += fill.generated.length + fill.curated.length;
    }
  }

  await writeModerationTrail(seeded, random, executor);
  await repairWatermarks(executor);

  return {
    people,
    moderators: people.slice(0, MODERATOR_COUNT),
    serverIds: seeded.map((server) => server.id),
    channels: seededChannels,
    messageCount: written,
    newestAt: new Date(endMs),
  };
}

// Invites, bans and the audit trail: the three surfaces a moderator opens that
// have nothing to show on a fresh database.
const INVITE_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

function inviteCode(random: Random): string {
  return Array.from(
    { length: 8 },
    () => INVITE_ALPHABET[random.int(INVITE_ALPHABET.length)] ?? "a",
  ).join("");
}

const BAN_REASONS = [
  "Repeated spam after two warnings",
  "Advertising in every channel",
  "Harassment in direct messages",
  "Ban evasion",
];

const AUDIT_ACTIONS = [
  { action: "channel_create", targetType: "channel" },
  { action: "role_update", targetType: "role" },
  { action: "role_assign", targetType: "user" },
  { action: "message_pin", targetType: "message" },
  { action: "invite_create", targetType: "invite" },
  { action: "overwrite_update", targetType: "channel" },
  { action: "channel_update", targetType: "channel" },
] as const;

async function writeModerationTrail(
  seeded: readonly SeededServer[],
  random: Random,
  executor: Executor = db,
): Promise<void> {
  const inviteRows: (typeof invites.$inferInsert)[] = [];
  const banRows: (typeof bans.$inferInsert)[] = [];
  const auditRows: (typeof auditLog.$inferInsert)[] = [];

  for (const server of seeded) {
    const [admin] = server.members;

    if (admin === undefined) {
      continue;
    }

    const moderator = server.moderators[1] ?? admin;

    // A spread of shapes rather than four identical rows: one permanent link
    // that has been used, one capped, one expiring, one already exhausted.
    const shapes = [
      {
        maxUses: null,
        uses: 40 + random.int(160),
        expiresAt: null,
        ageDays: 300,
      },
      { maxUses: 25, uses: 6 + random.int(12), expiresAt: null, ageDays: 60 },
      {
        maxUses: 100,
        uses: 3 + random.int(9),
        expiresAt: new Date(Date.now() + 6 * DAY_MS),
        ageDays: 9,
      },
      { maxUses: 5, uses: 5, expiresAt: null, ageDays: 21 },
    ];

    for (const [index, shape] of shapes.entries()) {
      const inviter = server.members[index % server.members.length] ?? admin;

      inviteRows.push({
        code: inviteCode(random),
        serverId: server.id,
        inviterId: inviter.id,
        maxUses: shape.maxUses,
        uses: shape.uses,
        expiresAt: shape.expiresAt,
        createdAt: new Date(
          Math.max(
            server.createdAt.getTime(),
            Date.now() - shape.ageDays * DAY_MS,
          ),
        ),
      });
    }

    // The banned members are drawn from the tail of the cast so a ban never
    // removes someone the curated conversations depend on.
    const candidates = server.members.slice(-6);

    for (const [index, person] of candidates.slice(0, 2).entries()) {
      if (person.id === admin.id) {
        continue;
      }

      banRows.push({
        serverId: server.id,
        userId: person.id,
        bannedBy: moderator.id,
        reason:
          BAN_REASONS[(index + server.plan.key.length) % BAN_REASONS.length] ??
          null,
        createdAt: new Date(Date.now() - (14 + random.int(90)) * DAY_MS),
      });

      auditRows.push({
        serverId: server.id,
        actorId: moderator.id,
        action: "member_ban",
        targetType: "user",
        targetId: person.id,
        metadata: { reason: BAN_REASONS[index % BAN_REASONS.length] ?? "spam" },
        createdAt: new Date(Date.now() - (14 + random.int(90)) * DAY_MS),
      });
    }

    auditRows.push({
      serverId: server.id,
      actorId: admin.id,
      action: "server_update",
      targetType: "server",
      targetId: server.id,
      metadata: { description: server.plan.description },
      createdAt: new Date(server.createdAt.getTime() + DAY_MS),
    });

    for (const [index, entry] of AUDIT_ACTIONS.entries()) {
      const actor =
        server.moderators[index % server.moderators.length] ?? admin;
      const channelId = server.channelIds.get(
        server.plan.channels[index % server.plan.channels.length]?.name ??
          "general",
      );

      auditRows.push({
        serverId: server.id,
        actorId: actor.id,
        action: entry.action,
        targetType: entry.targetType,
        targetId: channelId ?? server.id,
        metadata: {
          name:
            server.plan.channels[index % server.plan.channels.length]?.name ??
            null,
        },
        createdAt: new Date(Date.now() - (2 + random.int(120)) * DAY_MS),
      });
    }
  }

  for (const [rows, table] of [
    [inviteRows, invites],
    [banRows, bans],
    [auditRows, auditLog],
  ] as const) {
    if (rows.length === 0) {
      continue;
    }

    await executor
      .insert(table)
      .values(rows as never[])
      .onConflictDoNothing();
  }
}

export const DEMO_MEMBER_COUNT = 140;
export const DEMO_MESSAGE_COUNT = 9000;

export interface DemoDataset {
  community: CommunityResult;
  sandboxServerId: string;
}

export async function provisionDemoDataset(
  messageCount: number = DEMO_MESSAGE_COUNT,
  memberCount: number = DEMO_MEMBER_COUNT,
  executor: Executor = db,
): Promise<DemoDataset> {
  const community = await seedCommunity(messageCount, memberCount, executor);
  const sandbox = await seedSandboxTemplate(community.people, executor);

  // Reactions, replies, edits and pins across the whole corpus. Without this
  // the production demo is the only place the message surface looks empty,
  // because it was the one path that never ran it.
  await seedDensity(
    community.channels,
    community.people,
    community.moderators,
    createRandom(CORPUS_SEED + 1),
    executor,
  );

  return { community, sandboxServerId: sandbox.serverId };
}

export async function ensureDemoDataset(
  messageCount: number = DEMO_MESSAGE_COUNT,
  memberCount: number = DEMO_MEMBER_COUNT,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockDemoProvisioning(tx);

    const existing = await tx.query.servers.findFirst({
      columns: { id: true },
      where: { demoRole: "template" },
    });

    if (existing !== undefined) {
      return false;
    }

    await provisionDemoDataset(messageCount, memberCount, tx);

    return true;
  });
}
