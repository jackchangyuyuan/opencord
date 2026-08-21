import type { Pagination } from "@opencord/shared/schemas";
import { and, eq, gte, inArray } from "drizzle-orm";

import type { ServerContext } from "../../access/context.js";
import { db } from "../../db/index.js";
import {
  memberRoles,
  serverMembers,
  servers,
  users,
} from "../../db/schema/index.js";
import { type PublicRole, serializeRole } from "../roles/queries.js";
import { type PublicUser, serializeUser } from "../users/queries.js";

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

export interface ServerDetail extends ServerSummary {
  everyoneRole: PublicRole;
  roles: PublicRole[];
}

export interface ServerMemberEntry {
  user: PublicUser;
  nickname: string | null;
  joinedAt: string;
  roleIds: string[];
}

export interface Page<Entry> {
  data: Entry[];
  nextCursor: string | null;
}

export function serializeServerDetail(context: ServerContext): ServerDetail {
  return {
    ...serializeServer(context.server),
    everyoneRole: serializeRole(context.everyoneRole),
    roles: context.memberRoles.map(serializeRole),
  };
}

export async function isServerMember(
  serverId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ userId: serverMembers.userId })
    .from(serverMembers)
    .where(
      and(
        eq(serverMembers.serverId, serverId),
        eq(serverMembers.userId, userId),
      ),
    );

  return rows.length > 0;
}

export async function listServerMembers(
  serverId: string,
  page: Pagination,
): Promise<Page<ServerMemberEntry>> {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      image: users.image,
      nickname: serverMembers.nickname,
      joinedAt: serverMembers.joinedAt,
    })
    .from(serverMembers)
    .innerJoin(users, eq(users.id, serverMembers.userId))
    .where(
      and(
        eq(serverMembers.serverId, serverId),
        page.cursor === undefined
          ? undefined
          : gte(serverMembers.userId, page.cursor),
      ),
    )
    .orderBy(serverMembers.userId)
    .limit(page.limit + 1);

  const visible = rows.slice(0, page.limit);
  const next = rows[page.limit];

  const assignments =
    visible.length === 0
      ? []
      : await db
          .select({ userId: memberRoles.userId, roleId: memberRoles.roleId })
          .from(memberRoles)
          .where(
            and(
              eq(memberRoles.serverId, serverId),
              inArray(
                memberRoles.userId,
                visible.map((row) => row.id),
              ),
            ),
          )
          .orderBy(memberRoles.roleId);

  return {
    data: visible.map((row) => ({
      user: serializeUser(row),
      nickname: row.nickname,
      joinedAt: row.joinedAt.toISOString(),
      roleIds: assignments
        .filter((assignment) => assignment.userId === row.id)
        .map((assignment) => assignment.roleId),
    })),
    nextCursor: next === undefined ? null : next.id,
  };
}
