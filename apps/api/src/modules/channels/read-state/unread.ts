import { sql } from "drizzle-orm";

import { db } from "../../../db/index.js";

export interface UnreadState {
  lastReadMessageId: string | null;
  hasUnread: boolean;
  hasEveryone: boolean;
  mentionCount: number;
  unreadCount: number;
}

export type UnreadStates = Map<string, UnreadState>;

export const NOTHING_UNREAD: UnreadState = {
  lastReadMessageId: null,
  hasUnread: false,
  hasEveryone: false,
  mentionCount: 0,
  unreadCount: 0,
};

export const UNREAD_COUNT_CAP = 100;

interface UnreadRow extends Record<string, unknown> {
  channel_id: string;
  last_read_message_id: string | null;
  has_unread: boolean;
  has_everyone: boolean;
  mention_count: number;
  unread_count: number;
}

export async function countUnreadMentions(
  userId: string,
  channelId: string,
  lastReadMessageId: string,
): Promise<number> {
  const rows = await db.execute<{ mention_count: number }>(sql`
    select count(*)::int as mention_count
      from mentions m
      join messages msg on msg.id = m.message_id
     where m.user_id = ${userId}
       and m.channel_id = ${channelId}::uuid
       and msg.deleted_at is null
       and m.message_id > ${lastReadMessageId}
  `);

  return rows[0]?.mention_count ?? 0;
}

export async function loadUnreadStates(
  userId: string,
  channelIds: readonly string[],
): Promise<UnreadStates> {
  if (channelIds.length === 0) {
    return new Map();
  }

  const ids = sql.join(
    channelIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  const rows = await db.execute<UnreadRow>(sql`
    select c.id as channel_id,
           rs.last_read_message_id,
           c.last_message_id is not null
             and (rs.last_read_message_id is null
                  or c.last_message_id > rs.last_read_message_id) as has_unread,
           c.last_everyone_mention_id is not null
             and (rs.last_read_message_id is null
                  or c.last_everyone_mention_id > rs.last_read_message_id)
             and exists (select 1
                           from messages e
                          where e.id = c.last_everyone_mention_id
                            and e.author_id <> ${userId})
             as has_everyone,
           (select count(*)
              from mentions m
              join messages msg on msg.id = m.message_id
             where m.user_id = ${userId}
               and m.channel_id = c.id
               and msg.deleted_at is null
               and (rs.last_read_message_id is null
                    or m.message_id > rs.last_read_message_id))::int
             as mention_count,
           (select count(*)
              from (select 1
                      from messages um
                     where um.channel_id = c.id
                       and um.deleted_at is null
                       and um.author_id <> ${userId}
                       and (rs.last_read_message_id is null
                            or um.id > rs.last_read_message_id)
                     limit ${UNREAD_COUNT_CAP}) capped)::int
             as unread_count
      from channels c
      left join read_states rs
        on rs.channel_id = c.id and rs.user_id = ${userId}
     where c.id in (${ids})
  `);

  return new Map(
    rows.map((row) => [
      row.channel_id,
      {
        lastReadMessageId: row.last_read_message_id,
        hasUnread: row.has_unread,
        hasEveryone: row.has_everyone,
        mentionCount: row.mention_count,
        unreadCount: row.unread_count,
      },
    ]),
  );
}
