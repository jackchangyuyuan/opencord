import {
  UPLOAD_ASSOCIATION_WINDOW_MS,
  UPLOAD_CONTENT_TYPES,
  UPLOAD_PREFIX,
  type UploadKind,
} from "@opencord/shared/constants";

import {
  AppError,
  uploadKeyForbidden,
  uploadNotFound,
} from "../../lib/errors.js";
import { headObject, type StoredObject } from "../../lib/storage.js";

export async function requireOwnedUpload(
  kind: UploadKind,
  userId: string,
  objectKey: string,
): Promise<StoredObject> {
  if (!objectKey.startsWith(`${UPLOAD_PREFIX[kind]}/${userId}/`)) {
    throw uploadKeyForbidden();
  }

  const stored = await headObject(objectKey);

  if (stored === null) {
    throw uploadNotFound();
  }

  const expired =
    Date.now() - stored.lastModified.getTime() > UPLOAD_ASSOCIATION_WINDOW_MS;

  if (
    expired ||
    !(UPLOAD_CONTENT_TYPES as readonly string[]).includes(stored.contentType)
  ) {
    throw new AppError(
      400,
      "UPLOAD_REJECTED",
      expired
        ? "That upload is too old to attach"
        : "That upload is not an accepted image type",
    );
  }

  return stored;
}
