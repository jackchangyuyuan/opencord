import { REACTION_EMOJI } from "@opencord/shared/constants";
import { desc, eq, sql } from "drizzle-orm";

import type { Random } from "../../modules/demo/corpus.js";
import { PIN_LIMIT } from "../../modules/messages/pins/queries.js";
import { db } from "../index.js";
import { messages, reactions } from "../schema/index.js";
import type { SeededChannel, SeededUser } from "./community.js";

const BATCH = 2000;

export const DENSITY_SEED = 84117;

const SPREAD = 600;

const REACTED_SHARE = 0.38;
const REPLY_SHARE = 0.22;
const EDITED_SHARE = 0.11;

const PINS_PER_CHANNEL = 10;

const REPLY_REACH = 12;

const EMOJI_PER_MESSAGE = 3;
const REACTORS_PER_EMOJI = 5;

export interface DensityRow {
  id: string;
  authorId: string;
  createdAt: Date;
}

export interface ReplyPlan {
  id: string;
  replyToId: string;
}

export interface EditPlan {
  id: string;
  editedAt: Date;
}

export interface PinPlan {
  id: string;
  pinnedAt: Date;
  pinnedBy: string;
}

export interface ReactionPlan {
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
}

export interface DensityPlan {
  replies: ReplyPlan[];
  edits: EditPlan[];
  pins: PinPlan[];
  reactions: ReactionPlan[];
}

function sample<T>(rows: readonly T[], share: number, random: Random): T[] {
  return rows.filter(() => random.next() < share);
}

function minutes(count: number): number {
  return count * 60 * 1000;
}

export function planReplies(
  rows: readonly DensityRow[],
  random: Random,
): ReplyPlan[] {
  const plans: ReplyPlan[] = [];

  for (const [index, row] of rows.entries()) {
    if (index === 0 || random.next() >= REPLY_SHARE) {
      continue;
    }

    const reach = Math.min(index, REPLY_REACH);
    const target = rows[index - 1 - random.int(reach)];

    if (target !== undefined) {
      plans.push({ id: row.id, replyToId: target.id });
    }
  }

  return plans;
}

export function planEdits(
  rows: readonly DensityRow[],
  random: Random,
): EditPlan[] {
  return sample(rows, EDITED_SHARE, random).map((row) => ({
    id: row.id,
    editedAt: new Date(row.createdAt.getTime() + minutes(1 + random.int(20))),
  }));
}

export function planPins(
  rows: readonly DensityRow[],
  moderators: readonly SeededUser[],
  random: Random,
): PinPlan[] {
  if (moderators.length === 0 || rows.length === 0) {
    return [];
  }

  const wanted = Math.min(PINS_PER_CHANNEL, rows.length, PIN_LIMIT);
  const chosen = new Map<string, PinPlan>();

  for (
    let attempt = 0;
    chosen.size < wanted && attempt < wanted * 8;
    attempt += 1
  ) {
    const row = rows[random.int(rows.length)];

    if (row === undefined || chosen.has(row.id)) {
      continue;
    }

    chosen.set(row.id, {
      id: row.id,
      pinnedAt: new Date(row.createdAt.getTime() + minutes(2 + random.int(90))),
      pinnedBy: random.pick(moderators).id,
    });
  }

  return [...chosen.values()];
}

export function planReactions(
  rows: readonly DensityRow[],
  people: readonly SeededUser[],
  random: Random,
): ReactionPlan[] {
  const plans: ReactionPlan[] = [];

  if (people.length === 0) {
    return plans;
  }

  for (const row of sample(rows, REACTED_SHARE, random)) {
    const emoji = new Set<string>();
    const wanted = 1 + random.int(EMOJI_PER_MESSAGE);

    while (emoji.size < Math.min(wanted, REACTION_EMOJI.length)) {
      emoji.add(random.pick(REACTION_EMOJI));
    }

    for (const symbol of emoji) {
      const reactors = new Set<string>();
      const crowd = Math.min(1 + random.int(REACTORS_PER_EMOJI), people.length);

      while (reactors.size < crowd) {
        reactors.add(random.pick(people).id);
      }

      for (const userId of reactors) {
        plans.push({
          messageId: row.id,
          userId,
          emoji: symbol,
          createdAt: new Date(
            row.createdAt.getTime() + minutes(1 + random.int(120)),
          ),
        });
      }
    }
  }

  return plans;
}

export function planDensity(
  rows: readonly DensityRow[],
  people: readonly SeededUser[],
  moderators: readonly SeededUser[],
  random: Random,
): DensityPlan {
  return {
    replies: planReplies(rows, random),
    edits: planEdits(rows, random),
    pins: planPins(rows, moderators, random),
    reactions: planReactions(rows, people, random),
  };
}

function newestFirst(channelId: string): Promise<DensityRow[]> {
  return db
    .select({
      id: messages.id,
      authorId: messages.authorId,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.channelId, channelId))
    .orderBy(desc(messages.id))
    .limit(SPREAD);
}

async function writeReplies(plans: readonly ReplyPlan[]): Promise<void> {
  if (plans.length === 0) {
    return;
  }

  const pairs = sql.join(
    plans.map((plan) => sql`(${plan.id}::uuid, ${plan.replyToId}::uuid)`),
    sql`, `,
  );

  await db.execute(sql`
    update messages m
       set reply_to_id = v.reply_to_id
      from (values ${pairs}) as v(id, reply_to_id)
     where m.id = v.id
  `);
}

async function writeEdits(plans: readonly EditPlan[]): Promise<void> {
  if (plans.length === 0) {
    return;
  }

  const pairs = sql.join(
    plans.map(
      (plan) =>
        sql`(${plan.id}::uuid, ${plan.editedAt.toISOString()}::timestamptz)`,
    ),
    sql`, `,
  );

  await db.execute(sql`
    update messages m
       set edited_at = v.edited_at
      from (values ${pairs}) as v(id, edited_at)
     where m.id = v.id
  `);
}

async function writePins(plans: readonly PinPlan[]): Promise<void> {
  if (plans.length === 0) {
    return;
  }

  const triples = sql.join(
    plans.map(
      (plan) =>
        sql`(${plan.id}::uuid, ${plan.pinnedAt.toISOString()}::timestamptz, ${plan.pinnedBy}::text)`,
    ),
    sql`, `,
  );

  await db.execute(sql`
    update messages m
       set pinned_at = v.pinned_at,
           pinned_by = v.pinned_by
      from (values ${triples}) as v(id, pinned_at, pinned_by)
     where m.id = v.id
  `);
}

async function writeReactions(plans: readonly ReactionPlan[]): Promise<void> {
  for (let index = 0; index < plans.length; index += BATCH) {
    await db.insert(reactions).values(plans.slice(index, index + BATCH));
  }
}

export interface DensityResult {
  replies: number;
  edits: number;
  pins: number;
  reactions: number;
}

export async function seedDensity(
  channels: readonly SeededChannel[],
  people: readonly SeededUser[],
  moderators: readonly SeededUser[],
  random: Random,
): Promise<DensityResult> {
  const result: DensityResult = {
    replies: 0,
    edits: 0,
    pins: 0,
    reactions: 0,
  };

  for (const channel of channels) {
    const rows = (await newestFirst(channel.channelId)).reverse();
    const plan = planDensity(rows, people, moderators, random);

    await writeReplies(plan.replies);
    await writeEdits(plan.edits);
    await writePins(plan.pins);
    await writeReactions(plan.reactions);

    result.replies += plan.replies.length;
    result.edits += plan.edits.length;
    result.pins += plan.pins.length;
    result.reactions += plan.reactions.length;
  }

  return result;
}
