import { asc, like, sql } from "drizzle-orm";

import type { Transaction } from "../../db/index.js";
import {
  channelMembers,
  channels,
  dmPairs,
  messages,
  readStates,
  users,
} from "../../db/schema/index.js";
import { createRandom } from "../../db/seed/corpus.js";
import {
  DM_THREADS,
  type DmThread,
  MAX_COUNTERPART_OFFSET,
} from "../../db/seed/dm-threads.js";
import { SEED_USERNAME_PREFIX } from "../../db/seed/personas.js";
import { canonicalPair } from "../dms/queries.js";

const DM_SEED = 5091;

const MIN_GAP_MINUTES = 2;
const GAP_SPREAD_MINUTES = 23;

async function counterpartIds(tx: Transaction): Promise<string[]> {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(like(users.username, `${SEED_USERNAME_PREFIX}%`))
    .orderBy(asc(users.id))
    .limit(MAX_COUNTERPART_OFFSET + 1);

  return rows.map((row) => row.id);
}

function stampsFor(thread: DmThread, now: number, index: number): Date[] {
  const random = createRandom(DM_SEED + index);
  const stamps: number[] = [now - thread.freshnessMinutes * 60_000];

  for (let step = 1; step < thread.lines.length; step += 1) {
    const gap = MIN_GAP_MINUTES + random.int(GAP_SPREAD_MINUTES);
    const previous = stamps[0] ?? now;

    stamps.unshift(previous - gap * 60_000);
  }

  return stamps.map((at) => new Date(at));
}

async function openThread(
  tx: Transaction,
  visitorId: string,
  counterpartId: string,
  thread: DmThread,
  index: number,
  now: number,
): Promise<void> {
  const [channel] = await tx
    .insert(channels)
    .values({ serverId: null, type: "dm" })
    .returning({ id: channels.id });

  if (channel === undefined) {
    throw new Error("seeding a direct message produced no channel");
  }

  const pair = canonicalPair(visitorId, counterpartId);

  await tx
    .insert(dmPairs)
    .values({ userA: pair.low, userB: pair.high, channelId: channel.id });

  await tx.insert(channelMembers).values([
    { channelId: channel.id, userId: visitorId },
    { channelId: channel.id, userId: counterpartId },
  ]);

  const stamps = stampsFor(thread, now, index);

  const written = await tx
    .insert(messages)
    .values(
      thread.lines.map((line, position) => ({
        id: sql<string>`uuidv7(${(stamps[position] ?? new Date(now)).toISOString()}::timestamptz - clock_timestamp())`,
        channelId: channel.id,
        authorId: line.from === "visitor" ? visitorId : counterpartId,
        content: line.text,
        createdAt: stamps[position] ?? new Date(now),
      })),
    )
    .returning({ id: messages.id });

  const newest = written.at(-1);

  if (newest === undefined) {
    return;
  }

  await tx
    .update(channels)
    .set({ lastMessageId: newest.id })
    .where(sql`${channels.id} = ${channel.id}::uuid`);

  const readIndex = written.length - 1 - thread.unread;
  const watermark = written[readIndex];

  if (watermark !== undefined) {
    await tx.insert(readStates).values({
      userId: visitorId,
      channelId: channel.id,
      lastReadMessageId: watermark.id,
    });
  }
}

export async function openDemoDms(
  tx: Transaction,
  visitorId: string,
  now = Date.now(),
): Promise<number> {
  const personas = await counterpartIds(tx);
  let opened = 0;

  for (const [index, thread] of DM_THREADS.entries()) {
    const counterpartId = personas[thread.counterpartOffset];

    if (counterpartId === undefined) {
      continue;
    }

    await openThread(tx, visitorId, counterpartId, thread, index, now);
    opened += 1;
  }

  return opened;
}
