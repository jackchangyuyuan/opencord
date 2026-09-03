import { UPLOAD_PREFIX } from "@opencord/shared/constants";

import { logger } from "../lib/logger.js";
import { deleteObject, listObjectPages } from "../lib/storage.js";
import { referencedKeys } from "../modules/uploads/queries.js";

export const SWEEP_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export async function runOrphanSweep(
  now = Date.now(),
): Promise<{ deleted: number }> {
  let deleted = 0;

  for (const prefix of Object.values(UPLOAD_PREFIX)) {
    for await (const page of listObjectPages(`${prefix}/`)) {
      const stale = page
        .filter(
          (object) => now - object.lastModified.getTime() > SWEEP_THRESHOLD_MS,
        )
        .map((object) => object.objectKey);

      const referenced = await referencedKeys(stale);

      for (const objectKey of stale) {
        if (referenced.has(objectKey)) {
          continue;
        }

        await deleteObject(objectKey);
        deleted += 1;
      }
    }
  }

  logger.info({ deleted }, "Orphan sweep finished");

  return { deleted };
}
