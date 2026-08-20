import { Permissions } from "@opencord/shared/permissions";
import type { CreateServerInput } from "@opencord/shared/schemas";

import { db } from "../../db/index.js";
import { roles, serverMembers, servers } from "../../db/schema/index.js";
import { serializeServer, type ServerSummary } from "./queries.js";

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
