import { resolve, SERVER_ONLY_PERMISSIONS } from "@opencord/shared/permissions";
import type { OverwriteInput } from "@opencord/shared/schemas";
import { and, eq } from "drizzle-orm";

import {
  loadChannelOverwrites,
  type ServerContext,
} from "../../../access/context.js";
import { db, type Transaction } from "../../../db/index.js";
import {
  channelMemberOverwrites,
  channelRoleOverwrites,
  type ChannelRow,
  roles,
  serverMembers,
} from "../../../db/schema/index.js";
import { lockChannelOverwrites } from "../../../lib/advisory-locks.js";
import { writeAudit } from "../../../lib/audit.js";
import { AppError, notFound } from "../../../lib/errors.js";
import { emitPermissionsChanged } from "../../../socket/emit.js";
import { revokeServerRooms } from "../../../socket/rooms.js";
import {
  actorPosition,
  requireBelowActor,
  requireHeldPermissions,
} from "../../roles/policy.js";
import { highestPositionFor } from "../../roles/queries.js";
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
  await revokeServerRooms(serverId);

  emitPermissionsChanged(serverId);
}

async function requireEditableRole(
  context: ServerContext,
  roleId: string,
): Promise<void> {
  const [role] = await db
    .select({ position: roles.position })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.serverId, context.server.id)));

  if (role === undefined) {
    throw notFound("ROLE_NOT_FOUND", "That role is not part of this server");
  }

  requireBelowActor(role.position, actorPosition(context));
}

async function requireEditableMember(
  context: ServerContext,
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

  if (userId === context.userId || context.server.ownerId === userId) {
    return;
  }

  requireBelowActor(
    await highestPositionFor(context.server.id, userId),
    actorPosition(context),
  );
}

async function heldInChannel(
  tx: Transaction,
  context: ServerContext,
  channelId: string,
): Promise<number> {
  const overwrites = await loadChannelOverwrites(channelId, context.userId, tx);

  return resolve({
    userId: context.userId,
    serverOwnerId: context.server.ownerId,
    everyoneRole: context.everyoneRole,
    memberRoles: context.memberRoles,
    ...overwrites,
  });
}

type StoredOverwrite = { allow: number; deny: number } | undefined;

function requireChangeIsHeld(
  held: number,
  before: StoredOverwrite,
  after: OverwriteInput | null,
): void {
  const restored = before === undefined ? 0 : before.allow | before.deny;
  const written = after === null ? 0 : after.allow | after.deny;

  requireHeldPermissions(held, restored | written);
}

async function findRoleOverwrite(
  tx: Transaction,
  channelId: string,
  roleId: string,
): Promise<StoredOverwrite> {
  const [row] = await tx
    .select({
      allow: channelRoleOverwrites.allow,
      deny: channelRoleOverwrites.deny,
    })
    .from(channelRoleOverwrites)
    .where(
      and(
        eq(channelRoleOverwrites.channelId, channelId),
        eq(channelRoleOverwrites.roleId, roleId),
      ),
    );

  return row;
}

async function findMemberOverwrite(
  tx: Transaction,
  channelId: string,
  userId: string,
): Promise<StoredOverwrite> {
  const [row] = await tx
    .select({
      allow: channelMemberOverwrites.allow,
      deny: channelMemberOverwrites.deny,
    })
    .from(channelMemberOverwrites)
    .where(
      and(
        eq(channelMemberOverwrites.channelId, channelId),
        eq(channelMemberOverwrites.userId, userId),
      ),
    );

  return row;
}

export async function putRoleOverwrite(
  context: ServerContext,
  channel: ChannelRow,
  roleId: string,
  input: OverwriteInput,
): Promise<ChannelOverwrites> {
  await requireEditableRole(context, roleId);
  requireChannelScopedBits(input.allow, input.deny);

  await db.transaction(async (tx) => {
    await lockChannelOverwrites(tx, channel.id);

    requireChangeIsHeld(
      await heldInChannel(tx, context, channel.id),
      await findRoleOverwrite(tx, channel.id, roleId),
      input,
    );

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
      actorId: context.userId,
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
  roleId: string,
): Promise<void> {
  await requireEditableRole(context, roleId);

  const deleted = await db.transaction(async (tx) => {
    await lockChannelOverwrites(tx, channel.id);

    const existing = await findRoleOverwrite(tx, channel.id, roleId);

    requireChangeIsHeld(
      await heldInChannel(tx, context, channel.id),
      existing,
      null,
    );

    if (existing !== undefined) {
      await tx
        .delete(channelRoleOverwrites)
        .where(
          and(
            eq(channelRoleOverwrites.channelId, channel.id),
            eq(channelRoleOverwrites.roleId, roleId),
          ),
        );
    }

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId: context.userId,
      action: "overwrite_delete",
      targetType: "role",
      targetId: roleId,
      metadata: { channelId: channel.id },
    });

    return existing !== undefined;
  });

  if (deleted) {
    await announceOverwriteChange(context.server.id);
  }
}

export async function putMemberOverwrite(
  context: ServerContext,
  channel: ChannelRow,
  userId: string,
  input: OverwriteInput,
): Promise<ChannelOverwrites> {
  await requireEditableMember(context, userId);
  requireChannelScopedBits(input.allow, input.deny);

  await db.transaction(async (tx) => {
    await lockChannelOverwrites(tx, channel.id);

    requireChangeIsHeld(
      await heldInChannel(tx, context, channel.id),
      await findMemberOverwrite(tx, channel.id, userId),
      input,
    );

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
      actorId: context.userId,
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
  userId: string,
): Promise<void> {
  await requireEditableMember(context, userId);

  const deleted = await db.transaction(async (tx) => {
    await lockChannelOverwrites(tx, channel.id);

    const existing = await findMemberOverwrite(tx, channel.id, userId);

    requireChangeIsHeld(
      await heldInChannel(tx, context, channel.id),
      existing,
      null,
    );

    if (existing !== undefined) {
      await tx
        .delete(channelMemberOverwrites)
        .where(
          and(
            eq(channelMemberOverwrites.channelId, channel.id),
            eq(channelMemberOverwrites.userId, userId),
          ),
        );
    }

    await writeAudit(tx, {
      serverId: context.server.id,
      actorId: context.userId,
      action: "overwrite_delete",
      targetType: "member",
      targetId: userId,
      metadata: { channelId: channel.id },
    });

    return existing !== undefined;
  });

  if (deleted) {
    await announceOverwriteChange(context.server.id);
  }
}
