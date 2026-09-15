import type { Message } from "@opencord/shared/types";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

import type { ChannelContext } from "../../../access/context.js";
import { db } from "../../../db/index.js";
import { messages } from "../../../db/schema/index.js";
import { lockChannelPins } from "../../../lib/advisory-locks.js";
import { writeAudit } from "../../../lib/audit.js";
import { notFound, pinLimitReached } from "../../../lib/errors.js";
import { emitMessagePin } from "../../../socket/emit.js";
import { findLiveMessage, messageColumns } from "../queries.js";
import { serializeMessages, serializeOneMessage } from "../serialize.js";
import { countPins, listPinnedMessages, PIN_LIMIT } from "./queries.js";

export { PIN_LIMIT };

async function requireLive(channelId: string, messageId: string) {
  const message = await findLiveMessage(channelId, messageId);

  if (message === undefined) {
    throw notFound("MESSAGE_NOT_FOUND", "Message not found");
  }

  return message;
}

export async function pinMessage(
  context: ChannelContext,
  actorId: string,
  messageId: string,
): Promise<Message> {
  const channelId = context.channel.id;

  await requireLive(channelId, messageId);

  const pinned = await db.transaction(async (tx) => {
    await lockChannelPins(tx, channelId);

    const [row] = await tx
      .update(messages)
      .set({ pinnedAt: new Date(), pinnedBy: actorId })
      .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
      .returning(messageColumns);

    if (row === undefined) {
      throw notFound("MESSAGE_NOT_FOUND", "Message not found");
    }

    if ((await countPins(tx, channelId)) > PIN_LIMIT) {
      throw pinLimitReached();
    }

    if (context.server !== null) {
      await writeAudit(tx, {
        serverId: context.server.server.id,
        actorId,
        action: "message_pin",
        targetType: "message",
        targetId: row.id,
        metadata: { channelId },
      });
    }

    return row;
  });

  const serialized = await serializeOneMessage(pinned, actorId);

  emitMessagePin({
    channelId,
    messageId: serialized.id,
    pinnedAt: serialized.pinnedAt,
    pinnedBy: serialized.pinnedBy,
  });

  return serialized;
}

export async function unpinMessage(
  context: ChannelContext,
  actorId: string,
  messageId: string,
): Promise<Message> {
  const channelId = context.channel.id;
  const message = await requireLive(channelId, messageId);

  const unpinned = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(messages)
      .set({ pinnedAt: null, pinnedBy: null })
      .where(and(eq(messages.id, messageId), isNotNull(messages.pinnedAt)))
      .returning(messageColumns);

    if (row === undefined) {
      return null;
    }

    if (context.server !== null) {
      await writeAudit(tx, {
        serverId: context.server.server.id,
        actorId,
        action: "message_unpin",
        targetType: "message",
        targetId: row.id,
        metadata: { channelId },
      });
    }

    return row;
  });

  if (unpinned === null) {
    return serializeOneMessage(message, actorId);
  }

  const serialized = await serializeOneMessage(unpinned, actorId);

  emitMessagePin({
    channelId,
    messageId: serialized.id,
    pinnedAt: serialized.pinnedAt,
    pinnedBy: serialized.pinnedBy,
  });

  return serialized;
}

export async function listPins(
  channelId: string,
  viewerId: string,
): Promise<Message[]> {
  return serializeMessages(await listPinnedMessages(channelId), viewerId);
}
