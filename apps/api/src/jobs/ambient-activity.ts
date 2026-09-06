import { randomUUID } from "node:crypto";

import { REACTION_EMOJI } from "@opencord/shared/constants";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  like,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { config } from "../config.js";
import { db } from "../db/index.js";
import {
  channels,
  messages,
  reactions,
  servers,
  users,
} from "../db/schema/index.js";
import type { Random } from "../db/seed/corpus.js";
import { createRandom, messageBody, topicFor } from "../db/seed/corpus.js";
import { SEED_USERNAME_PREFIX } from "../db/seed/personas.js";
import { logger } from "../lib/logger.js";
import { refreshDemoPresence } from "../modules/demo/presence.js";
import { messageColumns } from "../modules/messages/queries.js";
import { serializeOneMessage } from "../modules/messages/serialize.js";
import {
  emitMessageCreate,
  emitReaction,
  emitTypingStart,
} from "../socket/emit.js";
import { listOnlineUserIds } from "../socket/presence.js";

const AMBIENT_CHANNELS = [
  { server: "OpenCord HQ", channel: "general" },
  { server: "The Lounge", channel: "random" },
] as const;

const AMBIENT_NONCE_PREFIX = "a3b1e7c0-0000-4000-8000-";

function ambientNonce(): string {
  return `${AMBIENT_NONCE_PREFIX}${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

const writtenByTheJob = sql`${messages.nonce}::text like ${`${AMBIENT_NONCE_PREFIX}%`}`;

export interface AmbientResult {
  posted: number;
  reacted: number;
  typed: number;
  pruned: number;
  present: number;
}

const IDLE: AmbientResult = {
  posted: 0,
  reacted: 0,
  typed: 0,
  pruned: 0,
  present: 0,
};

interface AmbientChannel {
  channelId: string;
  name: string;
}

async function anyGuestOnline(): Promise<boolean> {
  const online = await listOnlineUserIds();

  if (online.length === 0) {
    return false;
  }

  const guests = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, online), eq(users.isAnonymous, true)))
    .limit(1);

  return guests.length > 0;
}

async function findAmbientChannels(): Promise<AmbientChannel[]> {
  const rows = await db
    .select({ channelId: channels.id, name: channels.name })
    .from(channels)
    .innerJoin(servers, eq(servers.id, channels.serverId))
    .where(
      and(
        eq(servers.isDemoSandbox, false),
        eq(channels.type, "text"),
        or(
          ...AMBIENT_CHANNELS.map((target) =>
            and(
              eq(servers.name, target.server),
              eq(channels.name, target.channel),
            ),
          ),
        ),
      ),
    );

  return rows.flatMap((row) =>
    row.name === null ? [] : [{ channelId: row.channelId, name: row.name }],
  );
}

async function findPersonas(
  channelId: string,
): Promise<{ id: string; username: string }[]> {
  return db
    .selectDistinct({ id: users.id, username: users.username })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.authorId))
    .where(
      and(
        eq(messages.channelId, channelId),
        like(users.username, `${SEED_USERNAME_PREFIX}%`),
      ),
    )
    .limit(20);
}

async function postedRecently(
  channelIds: readonly string[],
  now: Date,
): Promise<boolean> {
  const [latest] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(and(inArray(messages.channelId, [...channelIds]), writtenByTheJob))
    .orderBy(desc(messages.createdAt))
    .limit(1);

  if (latest === undefined) {
    return false;
  }

  return (
    now.getTime() - latest.createdAt.getTime() <
    config.AMBIENT_ACTIVITY_INTERVAL_MS
  );
}

async function postOne(
  target: AmbientChannel,
  authorId: string,
  random: Random,
): Promise<boolean> {
  const [inserted] = await db
    .insert(messages)
    .values({
      channelId: target.channelId,
      authorId,
      content: messageBody(random, topicFor(target.name)),
      nonce: ambientNonce(),
    })
    .returning(messageColumns);

  if (inserted === undefined) {
    return false;
  }

  await db
    .update(channels)
    .set({
      lastMessageId: sql`greatest(${channels.lastMessageId}, ${inserted.id}::uuid)`,
    })
    .where(eq(channels.id, target.channelId));

  emitMessageCreate(await serializeOneMessage(inserted, authorId));

  return true;
}

const REACT_CHANCE = 0.4;
const REACT_WINDOW = 15;

async function react(
  target: AmbientChannel,
  userId: string,
  random: Random,
): Promise<number> {
  if (random.next() >= REACT_CHANCE) {
    return 0;
  }

  const candidates = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.channelId, target.channelId),
        isNull(messages.deletedAt),
        ne(messages.authorId, userId),
      ),
    )
    .orderBy(desc(messages.id))
    .limit(REACT_WINDOW);

  const recent = candidates[random.int(candidates.length)];

  if (recent === undefined) {
    return 0;
  }

  const emoji = random.pick(REACTION_EMOJI);

  const inserted = await db
    .insert(reactions)
    .values({ messageId: recent.id, userId, emoji })
    .onConflictDoNothing()
    .returning({ emoji: reactions.emoji });

  if (inserted.length === 0) {
    return 0;
  }

  emitReaction("reaction:add", {
    channelId: target.channelId,
    messageId: recent.id,
    userId,
    emoji,
  });

  return 1;
}

async function prune(
  channelIds: readonly string[],
  now: Date,
): Promise<number> {
  const removed = await db
    .delete(messages)
    .where(
      and(
        inArray(messages.channelId, [...channelIds]),
        writtenByTheJob,
        lt(
          messages.createdAt,
          new Date(now.getTime() - config.AMBIENT_ACTIVITY_RETENTION_MS),
        ),
      ),
    )
    .returning({ id: messages.id });

  return removed.length;
}

export async function runAmbientActivity(
  now = new Date(),
): Promise<AmbientResult> {
  if (!(await anyGuestOnline())) {
    return IDLE;
  }

  const present = await refreshDemoPresence();

  const targets = await findAmbientChannels();

  if (targets.length === 0) {
    return { ...IDLE, present };
  }

  const channelIds = targets.map((target) => target.channelId);
  const pruned = await prune(channelIds, now);

  if (await postedRecently(channelIds, now)) {
    return { ...IDLE, pruned, present };
  }

  const random = createRandom(now.getTime());

  const result: AmbientResult = {
    posted: 0,
    reacted: 0,
    typed: 0,
    pruned,
    present,
  };

  for (const target of targets) {
    const personas = await findPersonas(target.channelId);
    const speaker = personas[random.int(personas.length)];

    if (speaker === undefined) {
      continue;
    }

    if (await postOne(target, speaker.id, random)) {
      result.posted += 1;
    }

    const reactor = personas[random.int(personas.length)];

    if (reactor !== undefined) {
      result.reacted += await react(target, reactor.id, random);
    }

    const nextSpeaker = personas[random.int(personas.length)];

    if (nextSpeaker !== undefined) {
      emitTypingStart({
        channelId: target.channelId,
        userId: nextSpeaker.id,
      });
      result.typed += 1;
    }
  }

  logger.debug(result, "Ambient activity finished");

  return result;
}
