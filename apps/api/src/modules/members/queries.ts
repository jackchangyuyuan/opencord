import { and, eq, inArray, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db, type Transaction } from "../../db/index.js";
import { memberRoles, serverMembers, servers } from "../../db/schema/index.js";
import { notFound } from "../../lib/errors.js";

// Every caller needs the owner under the lock, and a server that vanished
// between resolving the request context and taking the lock is the same answer
// for all of them, so the check lives here rather than at each call site.
export async function lockedServerOwner(
  tx: Transaction,
  serverId: string,
): Promise<string> {
  const server = await lockServerForMembership(tx, serverId);

  if (server === undefined) {
    throw notFound("SERVER_NOT_FOUND", "That server does not exist");
  }

  return server.ownerId;
}

export async function isServerMember(
  serverId: string,
  userId: string,
  executor: Transaction | typeof db = db,
): Promise<boolean> {
  const rows = await executor
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

export async function listMemberServerIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(eq(serverMembers.userId, userId));

  return rows.map((row) => row.serverId);
}

export function listMembershipsOf(
  userIds: readonly string[],
): Promise<{ userId: string; serverId: string }[]> {
  return db
    .select({ userId: serverMembers.userId, serverId: serverMembers.serverId })
    .from(serverMembers)
    .where(inArray(serverMembers.userId, [...userIds]));
}

export async function listServerPeerIds(userId: string): Promise<string[]> {
  const mine = alias(serverMembers, "mine");
  const theirs = alias(serverMembers, "theirs");

  const rows = await db
    .selectDistinct({ userId: theirs.userId })
    .from(mine)
    .innerJoin(
      theirs,
      and(eq(theirs.serverId, mine.serverId), ne(theirs.userId, mine.userId)),
    )
    .where(eq(mine.userId, userId));

  return rows.map((row) => row.userId);
}

export async function sharesAServer(
  left: string,
  right: string,
): Promise<boolean> {
  const mine = alias(serverMembers, "mine");
  const theirs = alias(serverMembers, "theirs");

  const rows = await db
    .select({ serverId: mine.serverId })
    .from(mine)
    .innerJoin(theirs, eq(theirs.serverId, mine.serverId))
    .where(and(eq(mine.userId, left), eq(theirs.userId, right)))
    .limit(1);

  return rows.length > 0;
}

export async function listMembersAmong(
  serverId: string,
  userIds: readonly string[],
): Promise<string[]> {
  if (userIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({ userId: serverMembers.userId })
    .from(serverMembers)
    .where(
      and(
        eq(serverMembers.serverId, serverId),
        inArray(serverMembers.userId, [...userIds]),
      ),
    );

  return rows.map((row) => row.userId);
}

export async function listMemberRoleIds(
  serverId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ roleId: memberRoles.roleId })
    .from(memberRoles)
    .where(
      and(eq(memberRoles.serverId, serverId), eq(memberRoles.userId, userId)),
    )
    .orderBy(memberRoles.roleId);

  return rows.map((row) => row.roleId);
}

// Membership is what the owner column cannot enforce on its own: `owner_id`
// references users, not server_members. Every operation that changes who owns a
// server or who removes somebody from it takes this lock and re-reads the owner
// under it, so a transfer cannot land on somebody a concurrent kick is removing
// and two transfers cannot both act on the same outgoing owner.
//
// FOR NO KEY UPDATE, not FOR UPDATE: these operations must exclude each other,
// but FOR UPDATE would also block the KEY SHARE lock every `server_members`
// insert takes on its parent row -- which is an invite redemption, holding the
// membership advisory lock and waiting here while a ban waits for that advisory
// lock. That is a deadlock, and a weaker mode is all the invariant needs.
export async function lockServerForMembership(
  tx: Transaction,
  serverId: string,
): Promise<{ ownerId: string } | undefined> {
  const [row] = await tx
    .select({ ownerId: servers.ownerId })
    .from(servers)
    .where(eq(servers.id, serverId))
    .for("no key update");

  return row;
}
