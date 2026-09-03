import type { UpdateProfileInput } from "@opencord/shared/schemas";
import { eq } from "drizzle-orm";

import { db } from "../../db/index.js";
import { users } from "../../db/schema/index.js";
import {
  discardReplacedUpload,
  requireOwnedUpload,
} from "../uploads/associate.js";
import { type PublicUser, serializeUser } from "./queries.js";

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<PublicUser> {
  const nextKey = input.avatarObjectKey;
  let replacedKey: string | null = null;

  if (nextKey !== undefined) {
    await requireOwnedUpload("avatar", userId, nextKey);

    const current = await db.query.users.findFirst({
      columns: { avatarObjectKey: true },
      where: { id: userId },
    });

    replacedKey = current?.avatarObjectKey ?? null;
  }

  const [row] = await db
    .update(users)
    .set(input)
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      username: users.username,
      name: users.name,
      image: users.image,
      avatarObjectKey: users.avatarObjectKey,
    });

  if (row === undefined) {
    throw new Error("The profile update returned no row");
  }

  if (nextKey !== undefined) {
    await discardReplacedUpload(replacedKey, nextKey);
  }

  return serializeUser(row);
}
