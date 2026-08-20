import { Permissions } from "@opencord/shared/permissions";
import type {
  CreateServerInput,
  UpdateServerInput,
} from "@opencord/shared/schemas";
import { eq } from "drizzle-orm";

import type { ServerContext } from "../../access/context.js";
import { db } from "../../db/index.js";
import { roles, serverMembers, servers } from "../../db/schema/index.js";
import { writeAudit } from "../../lib/audit.js";
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
