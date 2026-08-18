import { randomUUID } from "node:crypto";

import { DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import {
  createPresignedPost,
  type PresignedPost,
} from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { afterAll, describe, expect, it } from "vitest";

import { config } from "../../src/config.js";
import { s3, signer } from "../../src/lib/storage.js";

const MAX_BYTES = 1024;
const SIGNING_BUCKET_MS = 3_600_000;
const URL_TTL_SECONDS = 86_400;

const prefix = `attachments/${randomUUID()}`;
const uploaded = `${prefix}/uploaded.png`;

function grant(objectKey: string): Promise<PresignedPost> {
  return createPresignedPost(signer, {
    Bucket: config.S3_BUCKET,
    Key: objectKey,
    Fields: { "Content-Type": "image/png" },
    Conditions: [
      ["eq", "$key", objectKey],
      ["content-length-range", 1, MAX_BYTES],
    ],
    Expires: 60,
  });
}

async function upload(
  post: PresignedPost,
  bytes: number,
  omit?: string,
): Promise<Response> {
  const form = new FormData();

  for (const [name, value] of Object.entries(post.fields)) {
    if (name !== omit) {
      form.append(name, value);
    }
  }

  form.append("file", new Blob([new Uint8Array(bytes)]), "image.png");

  return fetch(post.url, { method: "POST", body: form });
}

function signRead(objectKey: string, at: number): Promise<string> {
  return getSignedUrl(
    signer,
    new GetObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: objectKey,
      ResponseCacheControl: `private, max-age=${String(URL_TTL_SECONDS)}`,
    }),
    {
      signingDate: new Date(
        Math.floor(at / SIGNING_BUCKET_MS) * SIGNING_BUCKET_MS,
      ),
      expiresIn: URL_TTL_SECONDS + SIGNING_BUCKET_MS / 1000,
    },
  );
}

describe("presigned upload and download protocol", () => {
  afterAll(async () => {
    await s3.send(
      new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: uploaded }),
    );
  });

  it("rejects an upload larger than the policy's content-length-range", async () => {
    const res = await upload(
      await grant(`${prefix}/too-big.png`),
      MAX_BYTES + 1,
    );

    expect(res.status).toBe(400);
    await expect(res.text()).resolves.toContain("EntityTooLarge");
  });

  it("rejects an upload that omits the Content-Type the policy conditions", async () => {
    const post = await grant(`${prefix}/no-content-type.png`);

    expect(post.fields).toHaveProperty("Content-Type", "image/png");

    const res = await upload(post, 512, "Content-Type");

    expect(res.status).toBe(400);
    await expect(res.text()).resolves.toContain("InvalidPolicyDocument");
  });

  it("retrieves an uploaded object and refuses an expired URL", async () => {
    const posted = await upload(await grant(uploaded), 512);

    expect(posted.status).toBe(204);

    const fresh = await fetch(await signRead(uploaded, Date.now()));

    expect(fresh.status).toBe(200);
    await expect(
      fresh.arrayBuffer().then((body) => body.byteLength),
    ).resolves.toBe(512);

    const expired = await fetch(
      await getSignedUrl(
        signer,
        new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: uploaded }),
        { expiresIn: 60, signingDate: new Date(Date.now() - 600_000) },
      ),
    );

    expect(expired.status).toBe(403);
    await expect(expired.text()).resolves.toContain("Request has expired");
  });

  it("signs identically inside one bucket and differently across buckets", async () => {
    const start =
      Math.floor(Date.now() / SIGNING_BUCKET_MS) * SIGNING_BUCKET_MS;

    const [early, late, next] = await Promise.all([
      signRead(uploaded, start + 1),
      signRead(uploaded, start + SIGNING_BUCKET_MS - 1),
      signRead(uploaded, start + SIGNING_BUCKET_MS),
    ]);

    expect(late).toBe(early);
    expect(next).not.toBe(early);
    expect(early).toContain("response-cache-control");
  });
});
