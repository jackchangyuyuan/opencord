import { inArray, like, sql } from "drizzle-orm";

import { logger } from "../../lib/logger.js";
import { db } from "../index.js";
import { channels, servers, users } from "../schema/index.js";
import { COMMUNITY_SERVER_NAMES, seedCommunity } from "./community.js";
import { createRandom } from "./corpus.js";
import { DENSITY_SEED, seedDensity } from "./density.js";
import { seedImageAttachments } from "./images.js";
import { SEED_USERNAME_PREFIX } from "./personas.js";
import { SANDBOX_TEMPLATE_NAME, seedSandboxTemplate } from "./sandbox.js";

const DEFAULT_MESSAGE_COUNT = 200_000;

const AUTHORED_BY_A_PERSONA = sql`
  select m.channel_id
    from messages m
    join users u on u.id = m.author_id
   where u.username like ${`${SEED_USERNAME_PREFIX}%`}
`;

async function clear(): Promise<void> {
  await db
    .delete(servers)
    .where(
      inArray(servers.name, [...COMMUNITY_SERVER_NAMES, SANDBOX_TEMPLATE_NAME]),
    );

  await db.delete(servers).where(
    sql`${servers.id} in (
      select c.server_id from channels c
       where c.server_id is not null
         and c.id in (${AUTHORED_BY_A_PERSONA})
    )`,
  );

  await db
    .delete(channels)
    .where(sql`${channels.id} in (${AUTHORED_BY_A_PERSONA})`);

  await db
    .delete(users)
    .where(like(users.username, `${SEED_USERNAME_PREFIX}%`));
}

async function main(): Promise<void> {
  const requested = Number(process.argv[2] ?? DEFAULT_MESSAGE_COUNT);
  const messageCount = Number.isFinite(requested)
    ? Math.max(Math.trunc(requested), 1)
    : DEFAULT_MESSAGE_COUNT;

  const startedAt = Date.now();

  await clear();

  const community = await seedCommunity(messageCount);
  const sandbox = await seedSandboxTemplate(community.people);
  const images = await seedImageAttachments(community);

  const density = await seedDensity(
    community.channels,
    community.people,
    community.moderators,
    createRandom(DENSITY_SEED),
  );

  logger.info(
    {
      members: community.people.length,
      servers: community.serverIds.length,
      messages: community.messageCount + images.messages,
      imageMessages: images.messages,
      attachments: images.attachments,
      replies: density.replies,
      edits: density.edits,
      pins: density.pins,
      reactions: density.reactions,
      sandboxTemplate: sandbox.serverId,
      seconds: Math.round((Date.now() - startedAt) / 1000),
    },
    "Seed complete",
  );
}

await main();
await db.$client.end();
