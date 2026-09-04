import { and, eq, isNotNull, isNull, not, sql } from "drizzle-orm";
import postgres from "postgres";

import { db } from "../db/index.js";
import { messages, users } from "../db/schema/index.js";
import { logger } from "../lib/logger.js";
import { deleteObject } from "../lib/storage.js";
import { softDeleteMessage } from "../modules/messages/service.js";

export const ANONYMIZE_INTERVAL_MS = 24 * 60 * 60 * 1000;

const FOREIGN_KEY_VIOLATION = "23503";

export const FORMER_GUEST_PREFIX = "former-guest-";

export interface AnonymizeResult {
  anonymized: number;
  messagesRedacted: number;
  deleted: number;
}

function isForeignKeyViolation(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : error;

  return (
    cause instanceof postgres.PostgresError &&
    cause.code === FOREIGN_KEY_VIOLATION
  );
}

async function tryHardDelete(userId: string): Promise<boolean> {
  try {
    await db.delete(users).where(eq(users.id, userId));

    return true;
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return false;
    }

    throw error;
  }
}

export async function runGuestAnonymize(): Promise<AnonymizeResult> {
  const due = await db
    .select({ id: users.id, avatarObjectKey: users.avatarObjectKey })
    .from(users)
    .where(
      and(
        eq(users.isAnonymous, true),
        isNotNull(users.deactivatedAt),
        not(sql`${users.username} like ${`${FORMER_GUEST_PREFIX}%`}`),
      ),
    );

  const result: AnonymizeResult = {
    anonymized: 0,
    messagesRedacted: 0,
    deleted: 0,
  };

  for (const guest of due) {
    const live = await db
      .select({ id: messages.id, channelId: messages.channelId })
      .from(messages)
      .where(and(eq(messages.authorId, guest.id), isNull(messages.deletedAt)));

    const deletedAt = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          username: `${FORMER_GUEST_PREFIX}${guest.id}`,
          name: "Former guest",
          email: `deleted+${guest.id}@invalid`,
          image: null,
          avatarObjectKey: null,
        })
        .where(eq(users.id, guest.id));

      for (const message of live) {
        await softDeleteMessage(tx, message.channelId, message.id, deletedAt);
      }
    });

    if (guest.avatarObjectKey !== null) {
      try {
        await deleteObject(guest.avatarObjectKey);
      } catch (error) {
        logger.warn(
          { err: error, objectKey: guest.avatarObjectKey },
          "The anonymized avatar remains for the sweep",
        );
      }
    }

    result.anonymized += 1;
    result.messagesRedacted += live.length;

    if (await tryHardDelete(guest.id)) {
      result.deleted += 1;
    }
  }

  if (result.anonymized > 0) {
    logger.info(result, "Guest anonymization finished");
  }

  return result;
}
