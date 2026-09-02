import { randomUUID } from "node:crypto";

import {
  maxUploadBytes,
  UPLOAD_EXTENSION,
  UPLOAD_GRANT_TTL_SECONDS,
  UPLOAD_PREFIX,
} from "@opencord/shared/constants";
import type { CreateUploadInput } from "@opencord/shared/schemas";

import { createUploadGrant } from "../../lib/storage.js";

export interface UploadAuthorization {
  objectKey: string;
  upload: { url: string; fields: Record<string, string> };
  expiresIn: number;
}

export function uploadObjectKey(
  userId: string,
  input: Pick<CreateUploadInput, "kind" | "contentType">,
): string {
  const extension = UPLOAD_EXTENSION[input.contentType];

  return `${UPLOAD_PREFIX[input.kind]}/${userId}/${randomUUID()}.${extension}`;
}

export async function authorizeUpload(
  userId: string,
  input: CreateUploadInput,
): Promise<UploadAuthorization> {
  const objectKey = uploadObjectKey(userId, input);

  const upload = await createUploadGrant({
    objectKey,
    contentType: input.contentType,
    maxBytes: maxUploadBytes(input.kind),
  });

  return { objectKey, upload, expiresIn: UPLOAD_GRANT_TTL_SECONDS };
}
