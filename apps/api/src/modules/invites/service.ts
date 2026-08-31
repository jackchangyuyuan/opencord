import {
  type CreateInviteInput,
  INVITE_CODE_LENGTH,
} from "@opencord/shared/schemas";
import { customAlphabet } from "nanoid";
import postgres from "postgres";

import type { ServerContext } from "../../access/context.js";
import { db } from "../../db/index.js";
import { invites } from "../../db/schema/index.js";
import { writeAudit } from "../../lib/audit.js";
import { AppError, notFound } from "../../lib/errors.js";
import {
  type InvitePreview,
  type InviteSummary,
  loadInvitePreview,
  serializeInvite,
} from "./queries.js";

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
  actorId: string,
  input: CreateInviteInput,
): Promise<InviteSummary> {
  const expiresAt = expiry(input.expiresInHours);

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    try {
      return await db.transaction(async (tx) => {
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

export async function previewInvite(code: string): Promise<InvitePreview> {
  const preview = await loadInvitePreview(code);

  if (preview === undefined) {
    throw notFound("INVITE_NOT_FOUND", "That invite does not exist");
  }

  return preview;
}
