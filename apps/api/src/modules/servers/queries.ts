import { eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { serverMembers, servers } from "../../db/schema/index.js";

export interface ServerSummary {
  id: string;
  name: string;
  iconKey: string | null;
  ownerId: string;
  createdAt: string;
}

export function serializeServer(server: {
  id: string;
  name: string;
  iconKey: string | null;
  ownerId: string;
  createdAt: Date;
}): ServerSummary {
  return {
    id: server.id,
    name: server.name,
    iconKey: server.iconKey,
    ownerId: server.ownerId,
    createdAt: server.createdAt.toISOString(),
  };
}

export async function listServersForUser(
  userId: string,
): Promise<ServerSummary[]> {
  const rows = await db
    .select({
      id: servers.id,
      name: servers.name,
      iconKey: servers.iconKey,
      ownerId: servers.ownerId,
      createdAt: servers.createdAt,
    })
    .from(servers)
    .innerJoin(serverMembers, eq(serverMembers.serverId, servers.id))
    .where(eq(serverMembers.userId, userId))
    .orderBy(servers.id);

  return rows.map(serializeServer);
}
