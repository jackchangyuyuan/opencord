import { Permissions } from "@opencord/shared/permissions";
import type {
  CreateServerInput,
  UpdateServerInput,
} from "@opencord/shared/schemas";
import { and, eq } from "drizzle-orm";

import type { ServerContext } from "../../access/context.js";
import { db } from "../../db/index.js";
import { roles, serverMembers, servers } from "../../db/schema/index.js";
import { writeAudit } from "../../lib/audit.js";
import {
  conflict,
  forbidden,
  notFound,
  ownerMustTransfer,
} from "../../lib/errors.js";
import { consumeQuota, type QuotaSubject } from "../../lib/quota.js";
import {
  emitMemberEvent,
  emitPermissionsChanged,
  emitServerEvent,
} from "../../socket/emit.js";
import { syncServerRooms, syncUserRooms } from "../../socket/rooms.js";
import { createDefaultChannels } from "../channels/service.js";
import { isServerMember, lockedServerOwner } from "../members/queries.js";
import { requireOwnedUpload } from "../uploads/associate.js";
import {
  serializeServer,
  serializeServerDetail,
  type ServerDetail,
  type ServerSummary,
} from "./queries.js";

const EVERYONE_ROLE_NAME = "@everyone";

const EVERYONE_PERMISSIONS =
  Permissions.VIEW_CHANNEL |
  Permissions.SEND_MESSAGES |
  Permissions.ADD_REACTIONS |
  Permissions.CREATE_INVITE;

export async function createServer(
  owner: QuotaSubject,
  input: CreateServerInput,
): Promise<ServerSummary> {
  const ownerId = owner.id;

  const created = await db.transaction(async (tx) => {
    await consumeQuota(tx, owner, "serversCreated");

    const [server] = await tx
      .insert(servers)
      .values({ name: input.name, ownerId })
      .returning();

    if (server === undefined) {
      throw new Error("Server creation returned no row");
    }

    await tx.insert(roles).values({
      serverId: server.id,
      name: EVERYONE_ROLE_NAME,
      permissions: EVERYONE_PERMISSIONS,
      position: 0,
      isDefault: true,
    });

    await createDefaultChannels(tx, server.id);

    await tx
      .insert(serverMembers)
      .values({ serverId: server.id, userId: ownerId });

    return serializeServer(server);
  });

  await syncUserRooms([ownerId]);

  return created;
}

export async function updateServer(
  context: ServerContext,
  input: UpdateServerInput,
): Promise<ServerDetail> {
  const { iconObjectKey, ...rest } = input;

  if (iconObjectKey !== undefined) {
    await requireOwnedUpload("icon", context.userId, iconObjectKey);
  }

  const server = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(servers)
      .set(
        iconObjectKey === undefined
          ? rest
          : { ...rest, iconKey: iconObjectKey },
      )
      .where(eq(servers.id, context.server.id))
      .returning();

    if (updated === undefined) {
      throw new Error("Server update returned no row");
    }

    await writeAudit(tx, {
      serverId: updated.id,
      actorId: context.userId,
      action: "server_update",
      targetType: "server",
      targetId: updated.id,
      metadata: input,
    });

    return updated;
  });

  emitServerEvent("server:update", context.server.id);

  return serializeServerDetail({ ...context, server });
}

export async function transferOwnership(
  context: ServerContext,
  targetUserId: string,
): Promise<ServerDetail> {
  if (context.server.ownerId !== context.userId) {
    throw forbidden();
  }

  const server = await db.transaction(async (tx) => {
    const ownerId = await lockedServerOwner(tx, context.server.id);

    if (ownerId !== context.userId) {
      throw forbidden();
    }

    if (targetUserId === ownerId) {
      throw conflict("ALREADY_OWNER", "That user already owns this server");
    }

    if (!(await isServerMember(context.server.id, targetUserId, tx))) {
      throw notFound(
        "MEMBER_NOT_FOUND",
        "That user is not a member of this server",
      );
    }

    const [updated] = await tx
      .update(servers)
      .set({ ownerId: targetUserId })
      .where(eq(servers.id, context.server.id))
      .returning();

    if (updated === undefined) {
      throw new Error("Ownership transfer returned no row");
    }

    await writeAudit(tx, {
      serverId: updated.id,
      actorId: context.userId,
      action: "server_transfer",
      targetType: "user",
      targetId: targetUserId,
      metadata: { from: context.userId, to: targetUserId },
    });

    return updated;
  });

  await syncUserRooms([context.userId, targetUserId]);

  emitServerEvent("server:update", context.server.id);
  emitPermissionsChanged(context.server.id);

  return serializeServerDetail({ ...context, server });
}

export async function leaveServer(
  context: ServerContext,
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    if ((await lockedServerOwner(tx, context.server.id)) === userId) {
      throw ownerMustTransfer();
    }

    await tx
      .delete(serverMembers)
      .where(
        and(
          eq(serverMembers.serverId, context.server.id),
          eq(serverMembers.userId, userId),
        ),
      );
  });

  emitMemberEvent("member:leave", context.server.id, userId);

  await syncUserRooms([userId]);
}

export async function deleteServer(context: ServerContext): Promise<void> {
  if (context.server.ownerId !== context.userId) {
    throw forbidden();
  }

  await db.transaction(async (tx) => {
    if ((await lockedServerOwner(tx, context.server.id)) !== context.userId) {
      throw forbidden();
    }

    await tx.delete(servers).where(eq(servers.id, context.server.id));
  });

  emitServerEvent("server:delete", context.server.id);

  await syncServerRooms(context.server.id);
}
