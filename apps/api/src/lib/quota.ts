import { sql } from "drizzle-orm";

import { config } from "../config.js";
import { db, type Transaction } from "../db/index.js";
import { guestQuotaReached } from "./errors.js";

export const QUOTAS = {
  messagesSent: "messages_sent",
  uploadGrants: "upload_grants",
  uploadBytes: "upload_bytes",
  serversCreated: "servers_created",
  invitesCreated: "invites_created",
} as const;

export type QuotaName = keyof typeof QUOTAS;

export function ceilingFor(quota: QuotaName): number {
  const ceilings: Record<QuotaName, number> = {
    messagesSent: config.GUEST_MESSAGE_CEILING,
    uploadGrants: config.GUEST_UPLOAD_GRANT_CEILING,
    uploadBytes: config.GUEST_UPLOAD_BYTES_CEILING,
    serversCreated: config.GUEST_SERVER_CEILING,
    invitesCreated: config.GUEST_INVITE_CEILING,
  };

  return ceilings[quota];
}

export interface QuotaSubject {
  id: string;
  isAnonymous?: boolean | null | undefined;
}

export async function consumeQuota(
  executor: Transaction | typeof db,
  user: QuotaSubject,
  quota: QuotaName,
  delta = 1,
): Promise<void> {
  if (user.isAnonymous !== true || delta <= 0) {
    return;
  }

  const limit = ceilingFor(quota);
  const column = sql.raw(QUOTAS[quota]);

  if (delta > limit) {
    throw guestQuotaReached(QUOTAS[quota], limit);
  }

  const rows = await executor.execute(sql`
    insert into guest_quotas (user_id, ${column})
    values (${user.id}, ${delta})
    on conflict (user_id) do update
       set ${column} = guest_quotas.${column} + ${delta}
     where guest_quotas.${column} + ${delta} <= ${limit}
    returning ${column}
  `);

  if (rows.length === 0) {
    throw guestQuotaReached(QUOTAS[quota], limit);
  }
}
