import type { PublicUser } from "@opencord/shared/types";
import { eq, inArray } from "drizzle-orm";

import type { SessionUser } from "../../auth.js";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/index.js";
import { signMediaUrl } from "../../lib/storage.js";

export type { PublicUser };

export type UserRow = Pick<
  typeof users.$inferSelect,
  | "id"
  | "username"
  | "name"
  | "image"
  | "avatarObjectKey"
  | "description"
  | "customStatus"
  | "customStatusEmoji"
  | "isAnonymous"
>;

export const profileSelection = {
  id: users.id,
  username: users.username,
  name: users.name,
  image: users.image,
  avatarObjectKey: users.avatarObjectKey,
  description: users.description,
  customStatus: users.customStatus,
  customStatusEmoji: users.customStatusEmoji,
  isAnonymous: users.isAnonymous,
};

export async function serializeUser(user: UserRow): Promise<PublicUser> {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    avatarUrl:
      user.avatarObjectKey === null
        ? user.image
        : await signMediaUrl(user.avatarObjectKey, "cacheable"),
    description: user.description,
    customStatus: user.customStatus,
    customStatusEmoji: user.customStatusEmoji,
    isGuest: user.isAnonymous ?? false,
  };
}

export function serializeSessionUser(user: SessionUser): Promise<PublicUser> {
  return serializeUser({
    id: user.id,
    username: user.username,
    name: user.name,
    image: user.image ?? null,
    avatarObjectKey: user.avatarObjectKey ?? null,
    description: user.description ?? null,
    customStatus: user.customStatus ?? null,
    customStatusEmoji: user.customStatusEmoji ?? null,
    isAnonymous: user.isAnonymous ?? false,
  });
}

export function serializeUsers(
  rows: readonly UserRow[],
): Promise<PublicUser[]> {
  return Promise.all(rows.map((row) => serializeUser(row)));
}

export async function findUserById(
  userId: string,
): Promise<PublicUser | undefined> {
  const [user] = await db
    .select(profileSelection)
    .from(users)
    .where(eq(users.id, userId));

  return user === undefined ? undefined : serializeUser(user);
}

export async function findUsersByIds(
  userIds: readonly string[],
): Promise<PublicUser[]> {
  if (userIds.length === 0) {
    return [];
  }

  const rows = await db
    .select(profileSelection)
    .from(users)
    .where(inArray(users.id, [...userIds]));

  return serializeUsers(rows);
}
