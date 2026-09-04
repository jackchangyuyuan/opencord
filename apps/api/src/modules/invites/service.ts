import {
  type CreateInviteInput,
  INVITE_CODE_LENGTH,
} from "@opencord/shared/schemas";
import { sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import postgres from "postgres";

import type { ServerContext } from "../../access/context.js";
import { db } from "../../db/index.js";
import { invites, serverMembers } from "../../db/schema/index.js";
import { lockMembershipPair } from "../../lib/advisory-locks.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError, conflict, notFound, userBanned } from "../../lib/errors.js";
import { consumeQuota, type QuotaSubject } from "../../lib/quota.js";
import { emitMemberEvent, joinRedeemedServerRooms } from "../../socket/emit.js";
import {
  findInvite,
  type InvitePreview,
  type InviteSummary,
  loadInvitePreview,
  serializeInvite,
} from "./queries.js";

export interface RedeemedInvite {
  serverId: string;
  alreadyMember: boolean;
}

const UNIQUE_VIOLATION = "23505";

const CODE_ATTEMPTS = 3;

const newCode = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  INVITE_CODE_LENGTH,
);

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: unknown }).cause ?? error;

  return (
    cause instanceof postgres.PostgresError && cause.code === UNIQUE_VIOLATION
  );
}

function expiry(hours: number | null): Date | null {
  return hours === null ? null : new Date(Date.now() + hours * 3_600_000);
}

export async function createInvite(
  context: ServerContext,
  actor: QuotaSubject,
  input: CreateInviteInput,
): Promise<InviteSummary> {
  const actorId = actor.id;
  const expiresAt = expiry(input.expiresInHours);

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    try {
      return await db.transaction(async (tx) => {
        await consumeQuota(tx, actor, "invitesCreated");

        const [row] = await tx
          .insert(invites)
          .values({
            code: newCode(),
            serverId: context.server.id,
            inviterId: actorId,
            maxUses: input.maxUses,
            expiresAt,
          })
          .returning();

        if (row === undefined) {
          throw new Error("Creating the invite returned no row");
        }

        await writeAudit(tx, {
          serverId: context.server.id,
          actorId,
          action: "invite_create",
          targetType: "invite",
          targetId: row.code,
        });

        return serializeInvite(row);
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }

  throw new AppError(
    500,
    "INVITE_CODE_EXHAUSTED",
    "Could not mint a unique invite code",
  );
}

// One transaction in a fixed order: advisory lock, ban re-check, the atomic
// uses update, membership insert, audit row.
export async function redeemInvite(
  code: string,
  userId: string,
): Promise<RedeemedInvite> {
  const existing = await findInvite(code);

  if (existing === undefined) {
    throw notFound("INVITE_NOT_FOUND", "That invite does not exist");
  }

  const result = await db.transaction(async (tx) => {
    await lockMembershipPair(tx, existing.serverId, userId);

    const banned = await tx.execute<{ exists: boolean }>(
      sql`select exists(
            select 1 from bans
             where server_id = ${existing.serverId}::uuid and user_id = ${userId}
          ) as exists`,
    );

    if (banned[0]?.exists === true) {
      throw userBanned();
    }

    const member = await tx.execute<{ exists: boolean }>(
      sql`select exists(
            select 1 from server_members
             where server_id = ${existing.serverId}::uuid and user_id = ${userId}
          ) as exists`,
    );

    if (member[0]?.exists === true) {
      return { serverId: existing.serverId, alreadyMember: true };
    }

    const claimed = await tx.execute<{ code: string }>(
      sql`update invites set uses = uses + 1
           where code = ${code}
             and (max_uses is null or uses < max_uses)
             and (expires_at is null or expires_at > now())
        returning code`,
    );

    if (claimed.length === 0) {
      throw conflict("INVITE_EXHAUSTED", "That invite is no longer usable");
    }

    await tx
      .insert(serverMembers)
      .values({ serverId: existing.serverId, userId });

    await writeAudit(tx, {
      serverId: existing.serverId,
      actorId: userId,
      action: "invite_redeem",
      targetType: "invite",
      targetId: code,
    });

    return { serverId: existing.serverId, alreadyMember: false };
  });

  if (!result.alreadyMember) {
    await joinRedeemedServerRooms(userId, result.serverId);

    emitMemberEvent("member:join", result.serverId, userId);
  }

  return result;
}

export async function previewInvite(code: string): Promise<InvitePreview> {
  const preview = await loadInvitePreview(code);

  if (preview === undefined) {
    throw notFound("INVITE_NOT_FOUND", "That invite does not exist");
  }

  return preview;
}
