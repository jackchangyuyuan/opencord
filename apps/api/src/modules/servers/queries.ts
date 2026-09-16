import type { MemberPageQuery } from "@opencord/shared/schemas";
import { and, eq, gte, ilike, inArray, or, type SQL } from "drizzle-orm";

import type { ServerContext } from "../../access/context.js";
import { db } from "../../db/index.js";
import {
  memberRoles,
  serverMembers,
  servers,
  users,
} from "../../db/schema/index.js";
import { signMediaUrl } from "../../lib/storage.js";
import { type PublicRole, serializeRole } from "../roles/queries.js";
import {
  profileSelection,
  type PublicUser,
  serializeUser,
} from "../users/queries.js";

export interface ServerSummary {
  id: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  iconUrl: string | null;
  ownerId: string;
  createdAt: string;
}

export async function serializeServer(server: {
  id: string;
  name: string;
  description: string | null;
  iconKey: string | null;
  ownerId: string;
  createdAt: Date;
}): Promise<ServerSummary> {
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    iconKey: server.iconKey,
    iconUrl:
      server.iconKey === null
        ? null
        : await signMediaUrl(server.iconKey, "cacheable"),
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
      description: servers.description,
      iconKey: servers.iconKey,
      ownerId: servers.ownerId,
      createdAt: servers.createdAt,
    })
    .from(servers)
    .innerJoin(serverMembers, eq(serverMembers.serverId, servers.id))
    .where(eq(serverMembers.userId, userId))
    .orderBy(servers.id);

  return Promise.all(rows.map((row) => serializeServer(row)));
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

export async function serializeServerDetail(
  context: ServerContext,
): Promise<ServerDetail> {
  return {
    ...(await serializeServer(context.server)),
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

function escapeLike(term: string): string {
  return term.replaceAll(/[\\%_]/g, (match) => `\\${match}`);
}

function matching(term: string | undefined): SQL | undefined {
  if (term === undefined) {
    return undefined;
  }

  const pattern = `%${escapeLike(term)}%`;

  return or(ilike(users.username, pattern), ilike(users.name, pattern));
}

export async function findServerMember(
  serverId: string,
  userId: string,
): Promise<ServerMemberEntry | undefined> {
  const [row] = await db
    .select({
      ...profileSelection,
      nickname: serverMembers.nickname,
      joinedAt: serverMembers.joinedAt,
    })
    .from(serverMembers)
    .innerJoin(users, eq(users.id, serverMembers.userId))
    .where(
      and(
        eq(serverMembers.serverId, serverId),
        eq(serverMembers.userId, userId),
      ),
    )
    .limit(1);

  if (row === undefined) {
    return undefined;
  }

  const assignments = await db
    .select({ roleId: memberRoles.roleId })
    .from(memberRoles)
    .where(
      and(eq(memberRoles.serverId, serverId), eq(memberRoles.userId, userId)),
    )
    .orderBy(memberRoles.roleId);

  return {
    user: await serializeUser(row),
    nickname: row.nickname,
    joinedAt: row.joinedAt.toISOString(),
    roleIds: assignments.map((assignment) => assignment.roleId),
  };
}

export async function listServerMembers(
  serverId: string,
  page: MemberPageQuery,
): Promise<Page<ServerMemberEntry>> {
  const rows = await db
    .select({
      ...profileSelection,
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
        matching(page.q),
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
    data: await Promise.all(
      visible.map(async (row) => ({
        user: await serializeUser(row),
        nickname: row.nickname,
        joinedAt: row.joinedAt.toISOString(),
        roleIds: assignments
          .filter((assignment) => assignment.userId === row.id)
          .map((assignment) => assignment.roleId),
      })),
    ),
    nextCursor: next === undefined ? null : next.id,
  };
}
