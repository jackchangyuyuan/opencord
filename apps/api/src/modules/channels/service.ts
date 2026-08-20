import type { CreateChannelInput } from "@opencord/shared/schemas";
import { eq, sql } from "drizzle-orm";

import type { ServerContext } from "../../access/context.js";
import { db, type Transaction } from "../../db/index.js";
import { channels } from "../../db/schema/index.js";
import { writeAudit } from "../../lib/audit.js";
import { type ChannelSummary, serializeChannel } from "./queries.js";

const DEFAULT_CHANNEL_NAMES = ["general", "random"] as const;

export function createDefaultChannels(
  tx: Transaction,
  serverId: string,
): Promise<unknown> {
  return tx.insert(channels).values(
    DEFAULT_CHANNEL_NAMES.map((name, position) => ({
      serverId,
      type: "text" as const,
      name,
      position,
    })),
  );
}

export function createChannel(
  context: ServerContext,
  actorId: string,
  input: CreateChannelInput,
): Promise<ChannelSummary> {
  return db.transaction(async (tx) => {
    const [tail] = await tx
      .select({
        next: sql<number>`coalesce(max(${channels.position}), -1) + 1`,
      })
      .from(channels)
      .where(eq(channels.serverId, context.server.id));

    const [channel] = await tx
      .insert(channels)
      .values({
        serverId: context.server.id,
        type: "text",
        name: input.name,
        topic: input.topic ?? null,
        position: tail?.next ?? 0,
      })
      .returning();

    if (channel === undefined) {
      throw new Error("Channel creation returned no row");
    }

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId,
      action: "channel_create",
      targetType: "channel",
      targetId: channel.id,
      metadata: { name: channel.name },
    });

    return serializeChannel(channel);
  });
}
