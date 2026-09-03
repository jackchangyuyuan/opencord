import { db } from "../../db/index.js";
import { signMediaUrl } from "../../lib/storage.js";

export interface PublicUser {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
}

export interface UserRow {
  id: string;
  username: string;
  name: string;
  image?: string | null | undefined;
  avatarObjectKey?: string | null | undefined;
}

export async function serializeUser(user: UserRow): Promise<PublicUser> {
  const key = user.avatarObjectKey ?? null;

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    avatarUrl:
      key === null ? (user.image ?? null) : await signMediaUrl(key, true),
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
    columns: {
      id: true,
      username: true,
      name: true,
      image: true,
      avatarObjectKey: true,
    },
    where: { id: userId },
  });

  return user === undefined ? undefined : serializeUser(user);
}
