import type {
  CreateChannelInput,
  ReorderChannelsInput,
  UpdateChannelInput,
} from "@opencord/shared/schemas";
import { asc, eq, sql } from "drizzle-orm";

import { resolveAccessibleChannels } from "../../access/channels.js";
import type { ServerContext } from "../../access/context.js";
import { db, type Transaction } from "../../db/index.js";
import { type ChannelRow, channels } from "../../db/schema/index.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError, notFound } from "../../lib/errors.js";
import { emitChannelEvent, emitPermissionsChanged } from "../../socket/emit.js";
import { syncServerRooms } from "../../socket/rooms.js";
import { type ChannelSummary, serializeChannel } from "./queries.js";

const DEFAULT_CHANNEL_NAMES = ["general", "random"] as const;

export async function createDefaultChannels(
  tx: Transaction,
  serverId: string,
): Promise<void> {
  await tx.insert(channels).values(
    DEFAULT_CHANNEL_NAMES.map((name, position) => ({
      serverId,
      type: "text" as const,
      name,
      position,
    })),
  );
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

  await syncServerRooms(context.server.id);

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

  await syncServerRooms(context.server.id);

  emitPermissionsChanged(context.server.id);
}

export interface ReorderResult {
  channels: ChannelSummary[];
}

function merge(
  current: readonly { id: string }[],
  submitted: readonly string[],
): string[] {
  const moving = new Set(submitted);
  const queue = [...submitted];

  return current.map((row) =>
    moving.has(row.id) ? (queue.shift() ?? row.id) : row.id,
  );
}

export async function reorderChannels(
  context: ServerContext,
  actorId: string,
  input: ReorderChannelsInput,
): Promise<ReorderResult> {
  const serverId = context.server.id;

  const unique = new Set(input.channelIds);

  if (unique.size !== input.channelIds.length) {
    throw new AppError(
      400,
      "DUPLICATE_CHANNEL",
      "A channel may appear in the order only once",
    );
  }

  const summaries = await db.transaction(async (tx) => {
    const current = await tx
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.serverId, serverId))
      .orderBy(asc(channels.position), asc(channels.id))
      .for("update");

    const known = new Set(current.map((row) => row.id));

    for (const channelId of input.channelIds) {
      if (!known.has(channelId)) {
        throw notFound(
          "CHANNEL_NOT_FOUND",
          "That channel is not in this server",
        );
      }
    }

    const ordered = merge(current, input.channelIds);

    await tx.execute(sql`
      update ${channels} as c
         set position = v.position
        from (values ${sql.join(
          ordered.map(
            (channelId, position) =>
              sql`(${channelId}::uuid, ${position}::int)`,
          ),
          sql`, `,
        )}) as v(id, position)
       where c.id = v.id and c.server_id = ${serverId}
    `);

    await writeAudit(tx, {
      serverId,
      actorId,
      action: "channel_update",
      targetType: "channel",
      targetId: ordered[0] ?? serverId,
      metadata: { reordered: input.channelIds },
    });

    return tx
      .select()
      .from(channels)
      .where(eq(channels.serverId, serverId))
      .orderBy(asc(channels.position), asc(channels.id));
  });

  const [first] = summaries;

  if (first !== undefined) {
    emitChannelEvent("channel:update", serverId, first.id);
  }

  // The reorder is applied to the whole server, but the answer is the actor's
  // own view of it: a channel they cannot see is not named back to them.
  const accessible = await resolveAccessibleChannels(actorId);

  return {
    channels: summaries
      .filter((channel) => accessible.has(channel.id))
      .map(serializeChannel),
  };
}
