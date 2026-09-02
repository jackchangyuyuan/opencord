import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_AVATAR_BYTES,
  UPLOAD_PREFIX,
} from "@opencord/shared/constants";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { config } from "../../src/config.js";
import { s3 } from "../../src/lib/storage.js";
import { requireTestDatabase } from "../setup.js";

const password = "correct horse battery staple";

const signUpBody = z.object({ user: z.object({ id: z.string() }) });
const grantBody = z.object({
  objectKey: z.string(),
  upload: z.object({ url: z.url(), fields: z.record(z.string(), z.string()) }),
  expiresIn: z.number(),
});

interface Account {
  id: string;
  cookies: string[];
}

const posted: string[] = [];

async function signUp(username: string): Promise<Account> {
  const res = await request(app)
    .post("/api/auth/sign-up/email")
    .send({
      email: `${username}@example.com`,
      name: username,
      password,
      username,
    });

  expect(res.status).toBe(200);

  return {
    id: signUpBody.parse(res.body).user.id,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

function authorize(account: Account, body: Record<string, unknown>) {
  return request(app)
    .post("/api/v1/uploads")
    .set("Cookie", account.cookies)
    .send(body);
}

const attachment = {
  kind: "attachment",
  filename: "diagram.png",
  contentType: "image/png",
  size: 1024,
};

async function post(
  grant: z.infer<typeof grantBody>,
  bytes: number,
): Promise<Response> {
  const form = new FormData();

  for (const [name, value] of Object.entries(grant.upload.fields)) {
    form.append(name, value);
  }

  form.append("file", new Blob([new Uint8Array(bytes)]), "image.png");

  return fetch(grant.upload.url, { method: "POST", body: form });
}

describe("upload authorization", () => {
  beforeAll(requireTestDatabase);

  afterAll(async () => {
    for (const key of posted) {
      await s3.send(
        new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
      );
    }
  });

  it("derives the key from the plural prefix and the caller", async () => {
    const ada = await signUp("ada");

    const res = await authorize(ada, attachment);

    expect(res.status).toBe(201);

    const grant = grantBody.parse(res.body);

    expect(grant.objectKey.startsWith(`attachments/${ada.id}/`)).toBe(true);
    expect(grant.objectKey.endsWith(".png")).toBe(true);
    expect(UPLOAD_PREFIX.avatar).toBe("avatars");
    expect(UPLOAD_PREFIX.icon).toBe("icons");
  });

  it("returns Content-Type among the fields, and the form posts verbatim", async () => {
    const ada = await signUp("ada");

    const grant = grantBody.parse((await authorize(ada, attachment)).body);

    expect(grant.upload.fields).toHaveProperty("Content-Type", "image/png");

    posted.push(grant.objectKey);

    const uploaded = await post(grant, 512);

    expect(uploaded.status).toBe(204);
  });

  it("rejects an oversized attachment before any bytes move", async () => {
    const ada = await signUp("ada");

    const res = await authorize(ada, {
      ...attachment,
      size: MAX_ATTACHMENT_BYTES + 1,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
  });

  it("holds avatars to the smaller ceiling", async () => {
    const ada = await signUp("ada");

    expect(
      (
        await authorize(ada, {
          ...attachment,
          kind: "avatar",
          size: MAX_AVATAR_BYTES + 1,
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await authorize(ada, {
          ...attachment,
          kind: "avatar",
          size: MAX_AVATAR_BYTES,
        })
      ).status,
    ).toBe(201);
  });

  it("lets the storage service reject a body the API was told was small", async () => {
    const ada = await signUp("ada");

    const grant = grantBody.parse(
      (
        await authorize(ada, {
          ...attachment,
          kind: "avatar",
          size: 1024,
        })
      ).body,
    );

    const outcome = await post(grant, MAX_AVATAR_BYTES + 1).then(
      (res) => res.status,
      () => "reset" as const,
    );

    expect(outcome).not.toBe(204);
  });

  it("accepts only the four image content types", async () => {
    const ada = await signUp("ada");

    expect(
      (await authorize(ada, { ...attachment, contentType: "image/svg+xml" }))
        .status,
    ).toBe(400);
    expect(
      (await authorize(ada, { ...attachment, contentType: "image/webp" }))
        .status,
    ).toBe(201);
  });

  it("strips path separators out of a filename rather than trusting it", async () => {
    const ada = await signUp("ada");

    const res = await authorize(ada, {
      ...attachment,
      filename: "../../etc/passwd",
    });

    expect(res.status).toBe(201);
    expect(grantBody.parse(res.body).objectKey).not.toContain("passwd");
  });

  it("refuses an unauthenticated caller", async () => {
    const res = await request(app).post("/api/v1/uploads").send(attachment);

    expect(res.status).toBe(401);
  });
});
