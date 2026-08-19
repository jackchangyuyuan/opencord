import { db } from "../../db/index.js";

export interface PublicUser {
  id: string;
  username: string;
  name: string;
  avatarUrl: string | null;
}

export function serializeUser(user: {
  id: string;
  username: string;
  name: string;
  image?: string | null | undefined;
}): PublicUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    avatarUrl: user.image ?? null,
  };
}

export async function findUserById(
  userId: string,
): Promise<PublicUser | undefined> {
  const user = await db.query.users.findFirst({
    columns: { id: true, username: true, name: true, image: true },
    where: { id: userId },
  });

  return user === undefined ? undefined : serializeUser(user);
}
