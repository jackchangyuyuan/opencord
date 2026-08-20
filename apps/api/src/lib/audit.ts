import type { Transaction } from "../db/index.js";
import { type AuditAction, auditLog } from "../db/schema/index.js";

export interface AuditEntry {
  serverId: string;
  actorId: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(
  tx: Transaction,
  entry: AuditEntry,
): Promise<void> {
  await tx.insert(auditLog).values({
    serverId: entry.serverId,
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    metadata: entry.metadata ?? null,
  });
}
