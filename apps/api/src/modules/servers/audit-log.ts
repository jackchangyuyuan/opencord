import { AUDIT_TARGET_GROUPS } from "@opencord/shared/constants";
import type { AuditLogPageQuery } from "@opencord/shared/schemas";
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../../db/index.js";
import { type AuditAction, auditLog, users } from "../../db/schema/index.js";
import type { Page } from "./queries.js";

const PERSON_TARGETS = AUDIT_TARGET_GROUPS.member;

export interface AuditLogEntry {
  id: string;
  actorId: string;
  action: AuditAction;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface AuditPerson {
  id: string;
  name: string;
  username: string;
  isActor: boolean;
}

export async function listAuditPeople(
  serverId: string,
): Promise<AuditPerson[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      isActor: sql<boolean>`bool_or(${auditLog.actorId} = ${users.id})`,
    })
    .from(auditLog)
    .innerJoin(
      users,
      or(
        eq(users.id, auditLog.actorId),
        and(
          inArray(auditLog.targetType, PERSON_TARGETS),
          eq(users.id, auditLog.targetId),
        ),
      ),
    )
    .where(eq(auditLog.serverId, serverId))
    .groupBy(users.id, users.name, users.username)
    .orderBy(users.name, users.id);

  return rows;
}

function escapeLike(term: string): string {
  return term.replaceAll(/[\\%_]/g, (match) => `\\${match}`);
}

export async function listAuditLog(
  serverId: string,
  page: AuditLogPageQuery,
): Promise<Page<AuditLogEntry>> {
  const target = alias(users, "target_user");
  const term = page.q === undefined ? null : `%${escapeLike(page.q)}%`;

  const filters: (SQL | undefined)[] = [
    eq(auditLog.serverId, serverId),
    page.cursor === undefined ? undefined : lte(auditLog.id, page.cursor),
    page.action === undefined || page.action.length === 0
      ? undefined
      : inArray(auditLog.action, page.action),
    page.actorId === undefined ? undefined : eq(auditLog.actorId, page.actorId),
    page.target === undefined
      ? undefined
      : inArray(auditLog.targetType, [...AUDIT_TARGET_GROUPS[page.target]]),
    page.from === undefined ? undefined : gte(auditLog.createdAt, page.from),
    page.to === undefined ? undefined : lt(auditLog.createdAt, page.to),
    term === null
      ? undefined
      : or(
          ilike(users.name, term),
          ilike(users.username, term),
          ilike(target.name, term),
          ilike(target.username, term),
        ),
  ];

  const rows = await db
    .select({
      id: auditLog.id,
      actorId: auditLog.actorId,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.actorId))
    .leftJoin(target, eq(target.id, auditLog.targetId))
    .where(and(...filters))
    .orderBy(desc(auditLog.id))
    .limit(page.limit + 1);

  const next = rows[page.limit];

  return {
    data: rows.slice(0, page.limit).map((row) => ({
      id: row.id,
      actorId: row.actorId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: next === undefined ? null : next.id,
  };
}
