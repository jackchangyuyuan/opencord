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
import {
  isServerMember,
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

export function createServer(
  ownerId: string,
  input: CreateServerInput,
): Promise<ServerSummary> {
  return db.transaction(async (tx) => {
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

    await tx
      .insert(serverMembers)
      .values({ serverId: server.id, userId: ownerId });

    return serializeServer(server);
  });
}

export function updateServer(
  context: ServerContext,
  actorId: string,
  input: UpdateServerInput,
): Promise<ServerDetail> {
  return db.transaction(async (tx) => {
    const [server] = await tx
      .update(servers)
      .set(input)
      .where(eq(servers.id, context.server.id))
      .returning();

    if (server === undefined) {
      throw new Error("Server update returned no row");
    }

    await writeAudit(tx, {
      serverId: server.id,
      actorId,
      action: "server_update",
      targetType: "server",
      targetId: server.id,
      metadata: input,
    });

    return serializeServerDetail({ ...context, server });
  });
}

export async function transferOwnership(
  context: ServerContext,
  actorId: string,
  targetUserId: string,
): Promise<ServerDetail> {
  if (context.server.ownerId !== actorId) {
    throw forbidden();
  }

  if (targetUserId === context.server.ownerId) {
    throw conflict("ALREADY_OWNER", "That user already owns this server");
  }

  if (!(await isServerMember(context.server.id, targetUserId))) {
    throw notFound(
      "MEMBER_NOT_FOUND",
      "That user is not a member of this server",
    );
  }

  return db.transaction(async (tx) => {
    const [server] = await tx
      .update(servers)
      .set({ ownerId: targetUserId })
      .where(eq(servers.id, context.server.id))
      .returning();

    if (server === undefined) {
      throw new Error("Ownership transfer returned no row");
    }

    await writeAudit(tx, {
      serverId: server.id,
      actorId,
      action: "server_transfer",
      targetType: "user",
      targetId: targetUserId,
      metadata: { from: actorId, to: targetUserId },
    });

    return serializeServerDetail({ ...context, server });
  });
}

export async function leaveServer(
  context: ServerContext,
  userId: string,
): Promise<void> {
  if (context.server.ownerId === userId) {
    throw ownerMustTransfer();
  }

  await db
    .delete(serverMembers)
    .where(
      and(
        eq(serverMembers.serverId, context.server.id),
        eq(serverMembers.userId, userId),
      ),
    );
}

export async function deleteServer(
  context: ServerContext,
  actorId: string,
): Promise<void> {
  if (context.server.ownerId !== actorId) {
    throw forbidden();
  }

  await db.delete(servers).where(eq(servers.id, context.server.id));
}
