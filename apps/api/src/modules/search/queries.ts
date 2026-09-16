import type { Message } from "@opencord/shared/types";
import { type SQL, sql } from "drizzle-orm";

import { resolveChannelsEveryoneCanRead } from "../../access/channels.js";
import { db } from "../../db/index.js";
import { AppError } from "../../lib/errors.js";
import {
  knownTimeZone,
  uuidV7LowerBound,
  zonedDayEnd,
  zonedDayStart,
} from "../../lib/time-window.js";
import { loadAttachments, signAttachments } from "../messages/attachments.js";
import { serializeMessage } from "../messages/queries.js";
import { parseSearchQuery } from "./query.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SEARCH_MAX_LIMIT = 25;
export const SEARCH_MAX_RESULTS = 100;

export interface SearchRequest {
  raw: string;
  channelIds?: readonly string[];
  accessibleChannelIds: readonly string[];
  serverId?: string;
  timeZone?: string;
  limit: number;
  offset: number;
}

interface SearchRow extends Record<string, unknown> {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  nonce: string | null;
  replyToId: string | null;
  mentionsEveryone: boolean;
  pinnedAt: string | null;
  pinnedBy: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface SearchResult {
  data: Message[];
  degraded: boolean;
  limit: number;
  offset: number;
}

export function clampLimit(limit: number): number {
  return Math.min(Math.max(limit, 1), SEARCH_MAX_LIMIT);
}

export function windowFor(
  limit: number,
  offset: number,
): { limit: number; offset: number } {
  const clamped = clampLimit(limit);

  return {
    limit: Math.max(Math.min(clamped, SEARCH_MAX_RESULTS - offset), 0),
    offset,
  };
}

function literalArray(values: readonly string[], type: string): SQL {
  return sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::${sql.raw(type)}[]`;
}

async function reducesToNothing(text: string): Promise<boolean> {
  const rows = await db.execute<{ empty: boolean }>(
    sql`select websearch_to_tsquery('english', ${text})::text = '' as empty`,
  );

  return rows[0]?.empty ?? true;
}

export async function searchMessages(
  request: SearchRequest,
): Promise<SearchResult> {
  const parsed = parseSearchQuery(request.raw);

  const namedChannelIds = [
    ...new Set([
      ...(request.channelIds ?? []),
      ...parsed.filters.in.filter((value) => UUID.test(value)),
    ]),
  ];

  if (
    parsed.text === "" &&
    !parsed.hasFilters &&
    namedChannelIds.length === 0
  ) {
    throw new AppError(
      400,
      "SEARCH_QUERY_EMPTY",
      "Enter something to search for",
    );
  }

  const { limit, offset } = windowFor(request.limit, request.offset);

  const empty: SearchResult = { data: [], degraded: false, limit, offset };

  if (limit === 0 || request.accessibleChannelIds.length === 0) {
    return empty;
  }

  const degraded = parsed.text !== "" && (await reducesToNothing(parsed.text));
  const ranked = parsed.text !== "" && !degraded;

  if (
    parsed.text !== "" &&
    degraded &&
    !parsed.hasFilters &&
    namedChannelIds.length === 0
  ) {
    return { ...empty, degraded: true };
  }

  const where: SQL[] = [
    sql`m.channel_id = any(${literalArray(request.accessibleChannelIds, "uuid")})`,
    sql`m.deleted_at is null`,
  ];

  if (ranked) {
    where.push(
      sql`m.search_vector @@ websearch_to_tsquery('english', ${parsed.text})`,
    );
  }

  if (request.serverId !== undefined) {
    where.push(sql`c.server_id = ${request.serverId}::uuid`);
  }

  // Answered by id where the caller resolved one and by name where it did not.
  // Either way the predicate is intersected with the channels this user can
  // already see -- the `channel_id = any(accessible)` clause above is never
  // relaxed -- so naming a private channel matches nothing rather than revealing
  // anything.
  const channelIds = namedChannelIds;
  const channelNames = parsed.filters.in.filter((value) => !UUID.test(value));

  if (channelIds.length > 0 || channelNames.length > 0) {
    const alternatives: SQL[] = [];

    if (channelIds.length > 0) {
      alternatives.push(
        sql`m.channel_id = any(${literalArray(channelIds, "uuid")})`,
      );
    }

    if (channelNames.length > 0) {
      alternatives.push(
        sql`c.name = any(${literalArray(channelNames, "text")})`,
      );
    }

    where.push(sql`(${sql.join(alternatives, sql` or `)})`);
  }

  if (parsed.filters.from.length > 0) {
    where.push(
      sql`u.username = any(${literalArray(parsed.filters.from, "text")})`,
    );
  }

  const timeZone = knownTimeZone(request.timeZone);
  const from = parsed.filters.on ?? parsed.filters.after;
  const until = parsed.filters.on ?? parsed.filters.before;

  if (from !== null) {
    where.push(
      sql`m.id >= ${uuidV7LowerBound(zonedDayStart(from, timeZone))}::uuid`,
    );
  }

  if (until !== null) {
    where.push(
      sql`m.id < ${uuidV7LowerBound(zonedDayEnd(until, timeZone))}::uuid`,
    );
  }

  const order = ranked
    ? sql`ts_rank_cd(m.search_vector, websearch_to_tsquery('english', ${parsed.text})) desc, m.id desc`
    : sql`m.id desc`;

  const rows = await db.execute<SearchRow>(sql`
    select m.id,
           m.channel_id as "channelId",
           m.author_id as "authorId",
           m.content,
           m.nonce,
           m.reply_to_id as "replyToId",
           m.mentions_everyone as "mentionsEveryone",
           m.pinned_at as "pinnedAt",
           m.pinned_by as "pinnedBy",
           m.edited_at as "editedAt",
           m.deleted_at as "deletedAt",
           m.created_at as "createdAt"
      from messages m
      join channels c on c.id = m.channel_id
      join users u on u.id = m.author_id
     where ${sql.join(where, sql` and `)}
     order by ${order}
     limit ${limit} offset ${offset}
  `);

  const attachments = await loadAttachments(rows.map((row) => row.id));

  const publicChannels = await resolveChannelsEveryoneCanRead([
    ...new Set(rows.map((row) => row.channelId)),
  ]);

  return {
    data: await Promise.all(
      rows.map(async (row) => ({
        ...serializeMessage({
          ...row,
          pinnedAt: row.pinnedAt === null ? null : new Date(row.pinnedAt),
          editedAt: row.editedAt === null ? null : new Date(row.editedAt),
          deletedAt: row.deletedAt === null ? null : new Date(row.deletedAt),
          createdAt: new Date(row.createdAt),
        }),
        replyTo: null,
        reactions: [],
        attachments: await signAttachments(
          attachments.get(row.id) ?? [],
          publicChannels.has(row.channelId) ? "cacheable" : "no-store",
        ),
      })),
    ),
    degraded,
    limit,
    offset,
  };
}
