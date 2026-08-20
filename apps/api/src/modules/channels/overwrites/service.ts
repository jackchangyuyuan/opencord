import type { OverwriteInput } from "@opencord/shared/schemas";
import { and, eq } from "drizzle-orm";

import type { ChannelRow, ServerContext } from "../../../access/context.js";
import { db } from "../../../db/index.js";
import {
  channelMemberOverwrites,
  channelRoleOverwrites,
  roles,
  serverMembers,
} from "../../../db/schema/index.js";
import { writeAudit } from "../../../lib/audit.js";
import { notFound } from "../../../lib/errors.js";
import { type ChannelOverwrites, listChannelOverwrites } from "./queries.js";

async function requireRoleOfServer(
  serverId: string,
  roleId: string,
): Promise<void> {
  const rows = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.serverId, serverId)));

  if (rows.length === 0) {
    throw notFound("ROLE_NOT_FOUND", "That role is not part of this server");
  }
}

async function requireMemberOfServer(
  serverId: string,
  userId: string,
): Promise<void> {
  const rows = await db
    .select({ userId: serverMembers.userId })
    .from(serverMembers)
    .where(
      and(
        eq(serverMembers.serverId, serverId),
        eq(serverMembers.userId, userId),
      ),
    );

  if (rows.length === 0) {
    throw notFound(
      "MEMBER_NOT_FOUND",
      "That user is not a member of this server",
    );
  }
}

export async function putRoleOverwrite(
  context: ServerContext,
  channel: ChannelRow,
  actorId: string,
  roleId: string,
  input: OverwriteInput,
): Promise<ChannelOverwrites> {
  await requireRoleOfServer(context.server.id, roleId);

  await db.transaction(async (tx) => {
    await tx
      .insert(channelRoleOverwrites)
      .values({
        channelId: channel.id,
        serverId: context.server.id,
        roleId,
        allow: input.allow,
        deny: input.deny,
      })
      .onConflictDoUpdate({
        target: [channelRoleOverwrites.channelId, channelRoleOverwrites.roleId],
        set: { allow: input.allow, deny: input.deny },
      });

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId,
      action: "overwrite_update",
      targetType: "role",
      targetId: roleId,
      metadata: { channelId: channel.id, allow: input.allow, deny: input.deny },
    });
  });

  return listChannelOverwrites(channel.id);
}

export async function deleteRoleOverwrite(
  context: ServerContext,
  channel: ChannelRow,
  actorId: string,
  roleId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(channelRoleOverwrites)
      .where(
        and(
          eq(channelRoleOverwrites.channelId, channel.id),
          eq(channelRoleOverwrites.roleId, roleId),
        ),
      );

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId,
      action: "overwrite_delete",
      targetType: "role",
      targetId: roleId,
      metadata: { channelId: channel.id },
    });
  });
}

export async function putMemberOverwrite(
  context: ServerContext,
  channel: ChannelRow,
  actorId: string,
  userId: string,
  input: OverwriteInput,
): Promise<ChannelOverwrites> {
  await requireMemberOfServer(context.server.id, userId);

  await db.transaction(async (tx) => {
    await tx
      .insert(channelMemberOverwrites)
      .values({
        channelId: channel.id,
        serverId: context.server.id,
        userId,
        allow: input.allow,
        deny: input.deny,
      })
      .onConflictDoUpdate({
        target: [
          channelMemberOverwrites.channelId,
          channelMemberOverwrites.userId,
        ],
        set: { allow: input.allow, deny: input.deny },
      });

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId,
      action: "overwrite_update",
      targetType: "member",
      targetId: userId,
      metadata: { channelId: channel.id, allow: input.allow, deny: input.deny },
    });
  });

  return listChannelOverwrites(channel.id);
}

export async function deleteMemberOverwrite(
  context: ServerContext,
  channel: ChannelRow,
  actorId: string,
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(channelMemberOverwrites)
      .where(
        and(
          eq(channelMemberOverwrites.channelId, channel.id),
          eq(channelMemberOverwrites.userId, userId),
        ),
      );

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId,
      action: "overwrite_delete",
      targetType: "member",
      targetId: userId,
      metadata: { channelId: channel.id },
    });
  });
}
