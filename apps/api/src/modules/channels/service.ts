import type {
  CreateChannelInput,
  UpdateChannelInput,
} from "@opencord/shared/schemas";
import { eq, sql } from "drizzle-orm";

import type { ChannelRow, ServerContext } from "../../access/context.js";
import { db, type Transaction } from "../../db/index.js";
import { channels } from "../../db/schema/index.js";
import { writeAudit } from "../../lib/audit.js";
import {
  emitChannelEvent,
  emitPermissionsChanged,
  rederiveRoomsFor,
  serverMemberIds,
} from "../../socket/emit.js";
import { type ChannelSummary, serializeChannel } from "./queries.js";

const DEFAULT_CHANNEL_NAMES = ["general", "random"] as const;

export async function createDefaultChannels(
  tx: Transaction,
  serverId: string,
): Promise<string[]> {
  const created = await tx
    .insert(channels)
    .values(
      DEFAULT_CHANNEL_NAMES.map((name, position) => ({
        serverId,
        type: "text" as const,
        name,
        position,
      })),
    )
    .returning({ id: channels.id });

  return created.map((channel) => channel.id);
}

export async function createChannel(
  context: ServerContext,
  actorId: string,
  input: CreateChannelInput,
): Promise<ChannelSummary> {
  const channel = await db.transaction(async (tx) => {
    const [tail] = await tx
      .select({
        next: sql<number>`coalesce(max(${channels.position}), -1) + 1`,
      })
      .from(channels)
      .where(eq(channels.serverId, context.server.id));

    const [created] = await tx
      .insert(channels)
      .values({
        serverId: context.server.id,
        type: "text",
        name: input.name,
        topic: input.topic ?? null,
        position: tail?.next ?? 0,
      })
      .returning();

    if (created === undefined) {
      throw new Error("Channel creation returned no row");
    }

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId,
      action: "channel_create",
      targetType: "channel",
      targetId: created.id,
      metadata: { name: created.name },
    });

    return serializeChannel(created);
  });

  await rederiveRoomsFor(await serverMemberIds(context.server.id));

  emitChannelEvent("channel:create", context.server.id, channel.id);
  emitPermissionsChanged(context.server.id);

  return channel;
}

export async function updateChannel(
  context: ServerContext,
  channel: ChannelRow,
  actorId: string,
  input: UpdateChannelInput,
): Promise<ChannelSummary> {
  const summary = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(channels)
      .set(input)
      .where(eq(channels.id, channel.id))
      .returning();

    if (updated === undefined) {
      throw new Error("Channel update returned no row");
    }

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId,
      action: "channel_update",
      targetType: "channel",
      targetId: channel.id,
      metadata: input,
    });

    return serializeChannel(updated);
  });

  emitChannelEvent("channel:update", context.server.id, channel.id);

  return summary;
}

export async function deleteChannel(
  context: ServerContext,
  channel: ChannelRow,
  actorId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(channels).where(eq(channels.id, channel.id));

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId,
      action: "channel_delete",
      targetType: "channel",
      targetId: channel.id,
      metadata: { name: channel.name },
    });
  });

  emitChannelEvent("channel:delete", context.server.id, channel.id);

  await rederiveRoomsFor(await serverMemberIds(context.server.id));

  emitPermissionsChanged(context.server.id);
}
