import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  createPresignedPost,
  type PresignedPost,
} from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UPLOAD_GRANT_TTL_SECONDS } from "@opencord/shared/constants";

import { config } from "../config.js";

const BOOT_ASSERTION_KEY = "boot-assertion";

function makeClient(endpoint: string | undefined): S3Client {
  return new S3Client({
    region: config.AWS_REGION,
    credentials: {
      accessKeyId: config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    },
    ...(endpoint === undefined
      ? {}
      : { endpoint, forcePathStyle: config.S3_FORCE_PATH_STYLE }),
  });
}

export const s3 = makeClient(config.S3_ENDPOINT);

export const signer = makeClient(
  config.S3_PUBLIC_ENDPOINT ?? config.S3_ENDPOINT,
);

export async function assertStorageOrigin(): Promise<void> {
  const url = await getSignedUrl(
    signer,
    new GetObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: BOOT_ASSERTION_KEY,
    }),
    { expiresIn: 60 },
  );

  const { origin } = new URL(url);

  if (origin !== config.STORAGE_PUBLIC_ORIGIN) {
    throw new Error(
      `Presigned URLs resolve to ${origin}, but STORAGE_PUBLIC_ORIGIN is ${config.STORAGE_PUBLIC_ORIGIN}`,
    );
  }
}

export interface UploadGrantInput {
  objectKey: string;
  contentType: string;
  maxBytes: number;
}

export function createUploadGrant(
  input: UploadGrantInput,
): Promise<PresignedPost> {
  return createPresignedPost(signer, {
    Bucket: config.S3_BUCKET,
    Key: input.objectKey,
    Fields: { "Content-Type": input.contentType },
    Conditions: [
      ["eq", "$key", input.objectKey],
      ["content-length-range", 1, input.maxBytes],
    ],
    Expires: UPLOAD_GRANT_TTL_SECONDS,
  });
}

export interface StoredObject {
  contentType: string;
  size: number;
  lastModified: Date;
}

export async function headObject(
  objectKey: string,
): Promise<StoredObject | null> {
  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: objectKey }),
    );

    return {
      contentType: head.ContentType ?? "application/octet-stream",
      size: head.ContentLength ?? 0,
      lastModified: head.LastModified ?? new Date(0),
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "NotFound" || error.name === "NoSuchKey")
    ) {
      return null;
    }

    throw error;
  }
}

export async function deleteObject(objectKey: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: objectKey }),
  );
}

function bucketedSigningDate(): Date {
  const width = config.MEDIA_URL_SIGNING_BUCKET * 1000;

  return new Date(Math.floor(Date.now() / width) * width);
}

export function signMediaUrl(
  objectKey: string,
  isPublic: boolean,
): Promise<string> {
  const cacheControl = isPublic
    ? `private, max-age=${String(config.MEDIA_URL_TTL_PUBLIC)}`
    : "private, no-store";

  return getSignedUrl(
    signer,
    new GetObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: objectKey,
      ResponseCacheControl: cacheControl,
    }),
    isPublic
      ? {
          signingDate: bucketedSigningDate(),
          expiresIn:
            config.MEDIA_URL_TTL_PUBLIC + config.MEDIA_URL_SIGNING_BUCKET,
        }
      : { expiresIn: config.MEDIA_URL_TTL_PRIVATE },
  );
}
