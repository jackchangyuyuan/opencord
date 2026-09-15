import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { messages, users } from "../db/schema/index.js";
import { logger } from "../lib/logger.js";
import { FOREIGN_KEY_VIOLATION, isViolation } from "../lib/postgres-errors.js";
import { deleteObject } from "../lib/storage.js";
import { softDeleteMessages } from "../modules/messages/service.js";

export const ANONYMIZE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const FORMER_GUEST_PREFIX = "former-guest-";

export interface AnonymizeResult {
  anonymized: number;
  messagesHidden: number;
  deleted: number;
}

async function tryHardDelete(userId: string): Promise<boolean> {
  try {
    await db.delete(users).where(eq(users.id, userId));

    return true;
  } catch (error) {
    if (isViolation(error, FOREIGN_KEY_VIOLATION)) {
      return false;
    }

    throw error;
  }
}

export async function runGuestAnonymize(): Promise<AnonymizeResult> {
  const due = await db
    .select({
      id: users.id,
      username: users.username,
      avatarObjectKey: users.avatarObjectKey,
    })
    .from(users)
    .where(and(eq(users.isAnonymous, true), isNotNull(users.deactivatedAt)));

  const result: AnonymizeResult = {
    anonymized: 0,
    messagesHidden: 0,
    deleted: 0,
  };

  for (const guest of due) {
    if (!guest.username.startsWith(FORMER_GUEST_PREFIX)) {
      const live = await db
        .select({ id: messages.id, channelId: messages.channelId })
        .from(messages)
        .where(
          and(eq(messages.authorId, guest.id), isNull(messages.deletedAt)),
        );

      const deletedAt = new Date();

      const redacted = await db.transaction(async (tx) => {
        const [subject] = await tx
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, guest.id))
          .for("update");

        if (subject?.username.startsWith(FORMER_GUEST_PREFIX) !== false) {
          return false;
        }

        await tx
          .update(users)
          .set({
            username: `${FORMER_GUEST_PREFIX}${guest.id}`,
            name: "Former guest",
            email: `deleted+${guest.id}@invalid`,
            image: null,
            avatarObjectKey: null,
            description: null,
            customStatus: null,
            customStatusEmoji: null,
          })
          .where(eq(users.id, guest.id));

        await softDeleteMessages(tx, deletedAt, live);

        return true;
      });

      if (!redacted) {
        continue;
      }

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
      result.messagesHidden += live.length;
    }

    if (await tryHardDelete(guest.id)) {
      result.deleted += 1;
    }
  }

  if (result.anonymized > 0 || result.deleted > 0) {
    logger.info(result, "Guest anonymization finished");
  }

  return result;
}
