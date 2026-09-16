import type { PublicUser } from "@opencord/shared/types";

import { db } from "../../db/index.js";
import { users } from "../../db/schema/index.js";
import { signMediaUrl } from "../../lib/storage.js";

export type { PublicUser };

export interface UserRow {
  id: string;
  username: string;
  name: string;
  image?: string | null | undefined;
  avatarObjectKey?: string | null | undefined;
  description?: string | null | undefined;
  customStatus?: string | null | undefined;
  customStatusEmoji?: string | null | undefined;
  isAnonymous?: boolean | null | undefined;
}

export const PROFILE_COLUMNS = {
  id: true,
  username: true,
  name: true,
  image: true,
  avatarObjectKey: true,
  description: true,
  customStatus: true,
  customStatusEmoji: true,
  isAnonymous: true,
} as const;

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
  const key = user.avatarObjectKey ?? null;

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    avatarUrl:
      key === null
        ? (user.image ?? null)
        : await signMediaUrl(key, "cacheable"),
    description: user.description ?? null,
    customStatus: user.customStatus ?? null,
    customStatusEmoji: user.customStatusEmoji ?? null,
    isGuest: user.isAnonymous ?? false,
  };
}

export function serializeUsers(
  rows: readonly UserRow[],
): Promise<PublicUser[]> {
  return Promise.all(rows.map((row) => serializeUser(row)));
}

export async function findUserById(
  userId: string,
): Promise<PublicUser | undefined> {
  const user = await db.query.users.findFirst({
    columns: PROFILE_COLUMNS,
    where: { id: userId },
  });

  return user === undefined ? undefined : serializeUser(user);
}

export async function findUsersByIds(
  userIds: readonly string[],
): Promise<PublicUser[]> {
  if (userIds.length === 0) {
    return [];
  }

  const rows = await db.query.users.findMany({
    columns: PROFILE_COLUMNS,
    where: { id: { in: [...userIds] } },
  });

  return serializeUsers(rows);
}
