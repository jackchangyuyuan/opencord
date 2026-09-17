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
import { db, type Transaction } from "../db/index.js";
import {
  channels,
  messages,
  reactions,
  servers,
  users,
} from "../db/schema/index.js";
import { tryLockAmbientActivity } from "../lib/advisory-locks.js";
import { logger } from "../lib/logger.js";
import type { Random } from "../modules/demo/corpus.js";
import { createRandom, messageBody, topicFor } from "../modules/demo/corpus.js";
import { SEED_USERNAME_PREFIX } from "../modules/demo/dataset.js";
import { refreshDemoPresence } from "../modules/demo/presence.js";
import {
  messageColumns,
  type MessageRow,
} from "../modules/messages/queries.js";
import { hydrateOneMessage } from "../modules/messages/serialize.js";
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

interface ReactionEvent {
  channelId: string;
  messageId: string;
  userId: string;
  emoji: string;
}

interface AmbientPass {
  posted: { row: MessageRow; authorId: string }[];
  reacted: ReactionEvent[];
  typists: { channelId: string; userId: string }[];
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
        eq(servers.demoRole, "community"),
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
  tx: Transaction,
  channelId: string,
): Promise<{ id: string; username: string }[]> {
  return tx
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

// A timestamp check, not a counter: nothing in the runner guarantees a tick
// happens exactly once, so two runs inside one window must write once. Read
// under the pass's advisory lock, which is what makes that true of two workers
// rather than only of two ticks in one process.
async function postedRecently(
  tx: Transaction,
  channelIds: readonly string[],
  now: Date,
): Promise<boolean> {
  const [latest] = await tx
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
  tx: Transaction,
  target: AmbientChannel,
  authorId: string,
  random: Random,
): Promise<MessageRow | null> {
  const [inserted] = await tx
    .insert(messages)
    .values({
      channelId: target.channelId,
      authorId,
      content: messageBody(random, topicFor(target.name)),
      nonce: ambientNonce(),
    })
    .returning(messageColumns);

  if (inserted === undefined) {
    return null;
  }

  await tx
    .update(channels)
    .set({
      lastMessageId: sql`greatest(${channels.lastMessageId}, ${inserted.id}::uuid)`,
    })
    .where(eq(channels.id, target.channelId));

  return inserted;
}

const REACT_CHANCE = 0.4;
const REACT_WINDOW = 15;

const TYPISTS_PER_CHANNEL = 3;

async function react(
  tx: Transaction,
  target: AmbientChannel,
  userId: string,
  random: Random,
): Promise<ReactionEvent | null> {
  if (random.next() >= REACT_CHANCE) {
    return null;
  }

  const candidates = await tx
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
    return null;
  }

  const emoji = random.pick(REACTION_EMOJI);

  const inserted = await tx
    .insert(reactions)
    .values({ messageId: recent.id, userId, emoji })
    .onConflictDoNothing()
    .returning({ emoji: reactions.emoji });

  if (inserted.length === 0) {
    return null;
  }

  return { channelId: target.channelId, messageId: recent.id, userId, emoji };
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

  const written = await db.transaction(async (tx) => {
    if (!(await tryLockAmbientActivity(tx))) {
      return null;
    }

    if (await postedRecently(tx, channelIds, now)) {
      return null;
    }

    const random = createRandom(now.getTime());
    const pass: AmbientPass = { posted: [], reacted: [], typists: [] };

    for (const target of targets) {
      const personas = await findPersonas(tx, target.channelId);
      const speaker = personas[random.int(personas.length)];

      if (speaker === undefined) {
        continue;
      }

      const posted = await postOne(tx, target, speaker.id, random);

      if (posted !== null) {
        pass.posted.push({ row: posted, authorId: speaker.id });
      }

      const reactor = personas[random.int(personas.length)];
      const reacted =
        reactor === undefined
          ? null
          : await react(tx, target, reactor.id, random);

      if (reacted !== null) {
        pass.reacted.push(reacted);
      }

      const speakers = new Set<string>();
      const wanted = Math.min(
        1 + random.int(TYPISTS_PER_CHANNEL),
        personas.length,
      );

      while (speakers.size < wanted) {
        const candidate = personas[random.int(personas.length)];

        if (candidate === undefined) {
          break;
        }

        speakers.add(candidate.id);
      }

      for (const userId of speakers) {
        pass.typists.push({ channelId: target.channelId, userId });
      }
    }

    return pass;
  });

  if (written === null) {
    return { ...IDLE, pruned, present };
  }

  for (const message of written.posted) {
    emitMessageCreate(await hydrateOneMessage(message.row, message.authorId));
  }

  for (const reaction of written.reacted) {
    emitReaction("reaction:add", reaction);
  }

  for (const typist of written.typists) {
    emitTypingStart(typist);
  }

  const result: AmbientResult = {
    posted: written.posted.length,
    reacted: written.reacted.length,
    typed: written.typists.length,
    pruned,
    present,
  };

  logger.debug(result, "Ambient activity finished");

  return result;
}
