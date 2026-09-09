import {
  normalizeCustomStatus,
  normalizeProfileText,
  type UpdateProfileInput,
} from "@opencord/shared/schemas";
import { eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { users } from "../../db/schema/index.js";
import { emitUserUpdate } from "../../socket/emit.js";
import { requireOwnedUpload } from "../uploads/associate.js";
import { profileSelection, type PublicUser, serializeUser } from "./queries.js";

function writableColumns(input: UpdateProfileInput) {
  return {
    name: input.name,
    avatarObjectKey: input.avatarObjectKey,
    description:
      input.description == null
        ? input.description
        : normalizeProfileText(input.description),
    customStatus:
      input.customStatus == null
        ? input.customStatus
        : normalizeCustomStatus(input.customStatus),
    customStatusEmoji: input.customStatusEmoji,
  };
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<PublicUser> {
  if (input.avatarObjectKey !== undefined) {
    await requireOwnedUpload("avatar", userId, input.avatarObjectKey);
  }

  const [row] = await db
    .update(users)
    .set(writableColumns(input))
    .where(eq(users.id, userId))
    .returning(profileSelection);

  if (row === undefined) {
    throw new Error("The profile update returned no row");
  }

  await emitUserUpdate(userId);

  return serializeUser(row);
}
