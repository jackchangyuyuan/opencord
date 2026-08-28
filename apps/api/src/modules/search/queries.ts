import type { Message } from "@opencord/shared/types";
import { type SQL, sql } from "drizzle-orm";

import { db } from "../../db/index.js";
import { AppError } from "../../lib/errors.js";
import { serializeMessage } from "../messages/queries.js";
import { parseSearchQuery } from "./query.js";

export const SEARCH_MAX_LIMIT = 25;
export const SEARCH_MAX_RESULTS = 100;

export interface SearchRequest {
  raw: string;
  accessibleChannelIds: readonly string[];
  serverId?: string;
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

  if (parsed.text === "" && !parsed.hasFilters) {
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

  if (parsed.text !== "" && degraded && !parsed.hasFilters) {
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

  if (parsed.filters.in.length > 0) {
    where.push(sql`c.name = any(${literalArray(parsed.filters.in, "text")})`);
  }

  if (parsed.filters.from.length > 0) {
    where.push(
      sql`u.username = any(${literalArray(parsed.filters.from, "text")})`,
    );
  }

  if (parsed.filters.after !== null) {
    where.push(sql`m.created_at >= ${parsed.filters.after}::date`);
  }

  if (parsed.filters.before !== null) {
    where.push(
      sql`m.created_at < (${parsed.filters.before}::date + interval '1 day')`,
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

  return {
    data: rows.map((row) => ({
      ...serializeMessage({
        ...row,
        editedAt: row.editedAt === null ? null : new Date(row.editedAt),
        deletedAt: row.deletedAt === null ? null : new Date(row.deletedAt),
        createdAt: new Date(row.createdAt),
      }),
      replyTo: null,
    })),
    degraded,
    limit,
    offset,
  };
}
