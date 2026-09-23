import { logger } from "../../lib/logger.js";
import { createRandom } from "../../modules/demo/corpus.js";
import { seedCommunity } from "../../modules/demo/provision.js";
import { seedSandboxTemplate } from "../../modules/demo/sandbox.js";
import { db } from "../index.js";
import { clear } from "./clear.js";
import { DENSITY_SEED, seedDensity } from "./density.js";
import { seedImageAttachments } from "./images.js";

const DEFAULT_MESSAGE_COUNT = 200_000;

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
