import { SERVER_ONLY_PERMISSIONS } from "@opencord/shared/permissions";
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
import { AppError, notFound } from "../../../lib/errors.js";
import {
  emitPermissionsChanged,
  rederiveRoomsFor,
  serverMemberIds,
} from "../../../socket/emit.js";
import { actorPosition, highestPositionOf } from "../../roles/queries.js";
import {
  requireBelowActor,
  requireHeldPermissions,
} from "../../roles/service.js";
import { type ChannelOverwrites, listChannelOverwrites } from "./queries.js";

function requireChannelScopedBits(allow: number, deny: number): void {
  const offending = (allow | deny) & SERVER_ONLY_PERMISSIONS;

  if (offending !== 0) {
    throw new AppError(
      400,
      "NOT_A_CHANNEL_PERMISSION",
      "That permission is held server-wide and cannot be set per channel",
      { permissions: offending },
    );
  }
}

async function announceOverwriteChange(serverId: string): Promise<void> {
  await rederiveRoomsFor(await serverMemberIds(serverId));

  emitPermissionsChanged(serverId);
}

async function requireEditableRole(
  context: ServerContext,
  actorId: string,
  roleId: string,
): Promise<void> {
  const [role] = await db
    .select({ position: roles.position })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.serverId, context.server.id)));

  if (role === undefined) {
    throw notFound("ROLE_NOT_FOUND", "That role is not part of this server");
  }

  requireBelowActor(role.position, actorPosition(context, actorId));
}

async function requireEditableMember(
  context: ServerContext,
  actorId: string,
  userId: string,
): Promise<void> {
  const rows = await db
    .select({ userId: serverMembers.userId })
    .from(serverMembers)
    .where(
      and(
        eq(serverMembers.serverId, context.server.id),
        eq(serverMembers.userId, userId),
      ),
    );

  if (rows.length === 0) {
    throw notFound(
      "MEMBER_NOT_FOUND",
      "That user is not a member of this server",
    );
  }

  if (userId === actorId || context.server.ownerId === userId) {
    return;
  }

  requireBelowActor(
    await highestPositionOf(context.server.id, userId),
    actorPosition(context, actorId),
  );
}

export async function putRoleOverwrite(
  context: ServerContext,
  channel: ChannelRow,
  actorId: string,
  roleId: string,
  input: OverwriteInput,
): Promise<ChannelOverwrites> {
  await requireEditableRole(context, actorId, roleId);
  requireChannelScopedBits(input.allow, input.deny);
  requireHeldPermissions(context, input.allow | input.deny);

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

  await announceOverwriteChange(context.server.id);

  return listChannelOverwrites(channel.id);
}

export async function deleteRoleOverwrite(
  context: ServerContext,
  channel: ChannelRow,
  actorId: string,
  roleId: string,
): Promise<void> {
  await requireEditableRole(context, actorId, roleId);

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

  await announceOverwriteChange(context.server.id);
}

export async function putMemberOverwrite(
  context: ServerContext,
  channel: ChannelRow,
  actorId: string,
  userId: string,
  input: OverwriteInput,
): Promise<ChannelOverwrites> {
  await requireEditableMember(context, actorId, userId);
  requireChannelScopedBits(input.allow, input.deny);
  requireHeldPermissions(context, input.allow | input.deny);

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

  await announceOverwriteChange(context.server.id);

  return listChannelOverwrites(channel.id);
}

export async function deleteMemberOverwrite(
  context: ServerContext,
  channel: ChannelRow,
  actorId: string,
  userId: string,
): Promise<void> {
  await requireEditableMember(context, actorId, userId);

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

  await announceOverwriteChange(context.server.id);
}
