import { like, sql } from "drizzle-orm";

import { SEED_USERNAME_PREFIX } from "../../modules/demo/dataset.js";
import { db } from "../index.js";
import { channels, messages, servers, users } from "../schema/index.js";

const PERSONAS = sql`
  select u.id from users u where u.username like ${`${SEED_USERNAME_PREFIX}%`}
`;

export async function clear(): Promise<void> {
  await db.delete(servers).where(sql`${servers.ownerId} in (${PERSONAS})`);

  await db.delete(channels).where(
    sql`${channels.serverId} is null
        and ${channels.id} in (
          select cm.channel_id from channel_members cm
           where cm.user_id in (${PERSONAS})
        )`,
  );

  await db.delete(messages).where(sql`${messages.authorId} in (${PERSONAS})`);

  await db.execute(sql`
    update channels c
       set last_message_id = (
             select m.id from messages m
              where m.channel_id = c.id and m.deleted_at is null
              order by m.id desc limit 1
           )
     where c.last_message_id is not null
       and not exists (select 1 from messages m where m.id = c.last_message_id)
  `);

  await db.execute(sql`
    update channels c
       set last_everyone_mention_id = (
             select m.id from messages m
              where m.channel_id = c.id
                and m.deleted_at is null
                and m.mentions_everyone
              order by m.id desc limit 1
           )
     where c.last_everyone_mention_id is not null
       and not exists (
         select 1 from messages m where m.id = c.last_everyone_mention_id
       )
  `);

  await db
    .delete(users)
    .where(like(users.username, `${SEED_USERNAME_PREFIX}%`));
}
