import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
