import { sql } from "drizzle-orm";

import type { Transaction } from "../../../db/index.js";
import { db } from "../../../db/index.js";

export async function advanceWatermark(
  userId: string,
  channelId: string,
  messageId: string,
  executor: Transaction | typeof db = db,
): Promise<string | null> {
  const rows = await executor.execute<{ last_read_message_id: string }>(sql`
    insert into read_states (user_id, channel_id, last_read_message_id)
    select ${userId}, ${channelId}, m.id
      from messages m
     where m.id = ${messageId}
       and m.channel_id = ${channelId}
       and m.deleted_at is null
    on conflict (user_id, channel_id) do update
       set last_read_message_id = greatest(
             read_states.last_read_message_id,
             excluded.last_read_message_id
           ),
           updated_at = now()
    returning last_read_message_id
  `);

  return rows[0]?.last_read_message_id ?? null;
}
