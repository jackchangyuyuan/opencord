import { count, desc, eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { invites, serverMembers, servers } from "../../db/schema/index.js";

export type InviteRow = typeof invites.$inferSelect;

export interface InviteSummary {
  code: string;
  serverId: string;
  inviterId: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface InvitePreview {
  code: string;
  server: { id: string; name: string; iconKey: string | null };
  memberCount: number;
}

export function serializeInvite(invite: InviteRow): InviteSummary {
  return {
    code: invite.code,
    serverId: invite.serverId,
    inviterId: invite.inviterId,
    maxUses: invite.maxUses,
    uses: invite.uses,
    expiresAt: invite.expiresAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
  };
}

export async function listServerInvites(
  serverId: string,
): Promise<InviteSummary[]> {
  const rows = await db
    .select()
    .from(invites)
    .where(eq(invites.serverId, serverId))
    .orderBy(desc(invites.createdAt), invites.code);

  return rows.map(serializeInvite);
}

export function findInvite(code: string): Promise<InviteRow | undefined> {
  return db
    .select()
    .from(invites)
    .where(eq(invites.code, code))
    .then((rows) => rows[0]);
}

export async function loadInvitePreview(
  code: string,
): Promise<InvitePreview | undefined> {
  const [row] = await db
    .select({
      code: invites.code,
      serverId: servers.id,
      name: servers.name,
      iconKey: servers.iconKey,
    })
    .from(invites)
    .innerJoin(servers, eq(servers.id, invites.serverId))
    .where(eq(invites.code, code));

  if (row === undefined) {
    return undefined;
  }

  const [members] = await db
    .select({ total: count() })
    .from(serverMembers)
    .where(eq(serverMembers.serverId, row.serverId));

  return {
    code: row.code,
    server: { id: row.serverId, name: row.name, iconKey: row.iconKey },
    memberCount: members?.total ?? 0,
  };
}
