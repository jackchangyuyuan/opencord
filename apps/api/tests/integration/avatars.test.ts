import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import { serverMembers, users } from "../../src/db/schema/index.js";
import * as storage from "../../src/lib/storage.js";
import { signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

const serverBody = z.object({ id: z.string() });
const userBody = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
});
const serverDetail = z.object({
  id: z.string(),
  iconKey: z.string().nullable(),
  iconUrl: z.string().nullable(),
});

function stubStorage() {
  vi.spyOn(storage, "headObject").mockResolvedValue({
    contentType: "image/png",
    size: 2048,
    lastModified: new Date(),
  });

  return vi.spyOn(storage, "deleteObject").mockResolvedValue();
}

function avatarKey(userId: string): string {
  return `avatars/${userId}/${randomUUID()}.png`;
}

function iconKey(userId: string): string {
  return `icons/${userId}/${randomUUID()}.png`;
}

describe("avatars and icons", () => {
  beforeAll(requireTestDatabase);

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("signs the uploaded avatar and leaves users.image alone", async () => {
    const ada = await signUp("ada");

    stubStorage();

    const key = avatarKey(ada.id);

    const res = await request(app)
      .patch("/api/v1/users/@me")
      .set("Cookie", ada.cookies)
      .send({ name: "Ada L.", avatarObjectKey: key });

    expect(res.status).toBe(200);

    const body = userBody.parse(res.body);

    expect(body.name).toBe("Ada L.");
    expect(body.avatarUrl).toContain(key);

    const row = await db.query.users.findFirst({
      columns: { image: true, avatarObjectKey: true },
      where: { id: ada.id },
    });

    expect(row).toEqual({ image: null, avatarObjectKey: key });
  });

  it("falls back to the provider image when no upload exists", async () => {
    const ada = await signUp("ada");

    await db
      .update(users)
      .set({ image: "https://example.test/ada.png" })
      .where(eq(users.id, ada.id));

    const res = await request(app)
      .get("/api/v1/users/@me")
      .set("Cookie", ada.cookies);

    expect(userBody.parse(res.body).avatarUrl).toBe(
      "https://example.test/ada.png",
    );
  });

  it("leaves the object an avatar replaced for the sweep", async () => {
    const ada = await signUp("ada");

    const deleted = stubStorage();
    const first = avatarKey(ada.id);

    await request(app)
      .patch("/api/v1/users/@me")
      .set("Cookie", ada.cookies)
      .send({ avatarObjectKey: first });

    const next = avatarKey(ada.id);

    const res = await request(app)
      .patch("/api/v1/users/@me")
      .set("Cookie", ada.cookies)
      .send({ avatarObjectKey: next });

    expect(res.status).toBe(200);
    expect(userBody.parse(res.body).avatarUrl).toContain(next);
    expect(deleted).not.toHaveBeenCalled();
  });

  it("refuses an avatar key uploaded by somebody else", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    stubStorage();

    const res = await request(app)
      .patch("/api/v1/users/@me")
      .set("Cookie", grace.cookies)
      .send({ avatarObjectKey: avatarKey(ada.id) });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      error: { code: "UPLOAD_KEY_FORBIDDEN" },
    });
  });

  it("sets a server icon with MANAGE_SERVER and signs it", async () => {
    const ada = await signUp("ada");

    stubStorage();

    const created = await request(app)
      .post("/api/v1/servers")
      .set("Cookie", ada.cookies)
      .send({ name: "Analytical Engine" });

    const serverId = serverBody.parse(created.body).id;
    const key = iconKey(ada.id);

    const res = await request(app)
      .patch(`/api/v1/servers/${serverId}`)
      .set("Cookie", ada.cookies)
      .send({ iconObjectKey: key });

    expect(res.status).toBe(200);

    const body = serverDetail.parse(res.body);

    expect(body.iconKey).toBe(key);
    expect(body.iconUrl).toContain(key);
  });

  it("refuses an icon from a member without MANAGE_SERVER", async () => {
    const ada = await signUp("ada");
    const grace = await signUp("grace");

    stubStorage();

    const created = await request(app)
      .post("/api/v1/servers")
      .set("Cookie", ada.cookies)
      .send({ name: "Analytical Engine" });

    const serverId = serverBody.parse(created.body).id;

    await db.insert(serverMembers).values({ serverId, userId: grace.id });

    const res = await request(app)
      .patch(`/api/v1/servers/${serverId}`)
      .set("Cookie", grace.cookies)
      .send({ iconObjectKey: iconKey(grace.id) });

    expect(res.status).toBe(403);

    const row = await db.query.servers.findFirst({
      columns: { iconKey: true },
      where: { id: serverId },
    });

    expect(row?.iconKey).toBeNull();
  });

  it("replaces a server icon without deleting the old object", async () => {
    const ada = await signUp("ada");
    const deleted = stubStorage();

    const serverId = serverBody.parse(
      (
        await request(app)
          .post("/api/v1/servers")
          .set("Cookie", ada.cookies)
          .send({ name: "Analytical Engine" })
      ).body,
    ).id;

    await request(app)
      .patch(`/api/v1/servers/${serverId}`)
      .set("Cookie", ada.cookies)
      .send({ iconObjectKey: iconKey(ada.id) });

    const next = iconKey(ada.id);

    const res = await request(app)
      .patch(`/api/v1/servers/${serverId}`)
      .set("Cookie", ada.cookies)
      .send({ iconObjectKey: next });

    expect(res.status).toBe(200);
    expect(serverDetail.parse(res.body).iconKey).toBe(next);
    expect(deleted).not.toHaveBeenCalled();
  });
});
