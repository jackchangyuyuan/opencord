import type { Pagination } from "@opencord/shared/schemas";
import { and, desc, eq, lte } from "drizzle-orm";

import { db } from "../../db/index.js";
import { type AuditAction, auditLog } from "../../db/schema/index.js";
import type { Page } from "./queries.js";

export interface AuditLogEntry {
  id: string;
  actorId: string;
  action: AuditAction;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  createdAt: string;
}

export async function listAuditLog(
  serverId: string,
  page: Pagination,
): Promise<Page<AuditLogEntry>> {
  const rows = await db
    .select()
    .from(auditLog)
    .where(
      and(
        eq(auditLog.serverId, serverId),
        page.cursor === undefined ? undefined : lte(auditLog.id, page.cursor),
      ),
    )
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
