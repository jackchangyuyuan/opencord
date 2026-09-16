import {
  UPLOAD_ASSOCIATION_WINDOW_MS,
  UPLOAD_CONTENT_TYPES,
  UPLOAD_PREFIX,
  type UploadContentType,
  type UploadKind,
} from "@opencord/shared/constants";

import {
  AppError,
  uploadKeyForbidden,
  uploadNotFound,
} from "../../lib/errors.js";
import { headObject, type StoredObject } from "../../lib/storage.js";

function isGrantedKey(kind: UploadKind, userId: string, objectKey: string) {
  const prefix = `${UPLOAD_PREFIX[kind]}/${userId}/`;

  return (
    objectKey.startsWith(prefix) &&
    !objectKey.slice(prefix.length).includes("/")
  );
}

function isAcceptedType(value: string): value is UploadContentType {
  return (UPLOAD_CONTENT_TYPES as readonly string[]).includes(value);
}

export interface OwnedUpload extends StoredObject {
  contentType: UploadContentType;
}

export async function requireOwnedUpload(
  kind: UploadKind,
  userId: string,
  objectKey: string,
): Promise<OwnedUpload> {
  if (!isGrantedKey(kind, userId, objectKey)) {
    throw uploadKeyForbidden();
  }

  const stored = await headObject(objectKey);

  if (stored === null) {
    throw uploadNotFound();
  }

  if (
    Date.now() - stored.lastModified.getTime() >
    UPLOAD_ASSOCIATION_WINDOW_MS
  ) {
    throw new AppError(
      400,
      "UPLOAD_REJECTED",
      "That upload is too old to attach",
    );
  }

  if (!isAcceptedType(stored.contentType)) {
    throw new AppError(
      400,
      "UPLOAD_REJECTED",
      "That upload is not an accepted image type",
    );
  }

  return { ...stored, contentType: stored.contentType };
}
