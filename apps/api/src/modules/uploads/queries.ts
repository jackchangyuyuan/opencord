import { inArray } from "drizzle-orm";

import { db } from "../../db/index.js";
import { attachments, servers, users } from "../../db/schema/index.js";

export async function referencedKeys(
  candidates: readonly string[],
): Promise<Set<string>> {
  if (candidates.length === 0) {
    return new Set();
  }

  const keys = [...candidates];

  const attached = await db
    .select({ objectKey: attachments.objectKey })
    .from(attachments)
    .where(inArray(attachments.objectKey, keys));

  const avatars = await db
    .select({ objectKey: users.avatarObjectKey })
    .from(users)
    .where(inArray(users.avatarObjectKey, keys));

  const icons = await db
    .select({ objectKey: servers.iconKey })
    .from(servers)
    .where(inArray(servers.iconKey, keys));

  return new Set(
    [...attached, ...avatars, ...icons].flatMap((row) =>
      row.objectKey === null ? [] : [row.objectKey],
    ),
  );
}
