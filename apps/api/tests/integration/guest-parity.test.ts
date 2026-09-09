import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { app } from "../../src/app.js";
import { type Account, signUp } from "../helpers/accounts.js";
import { requireTestDatabase } from "../setup.js";

const userBody = z.object({ user: z.object({ id: z.string() }) });
const idBody = z.object({ id: z.string() });
const codeBody = z.object({ code: z.string() });
const channelList = z.array(z.object({ id: z.string() }));

async function signInAnonymously(): Promise<Account> {
  const res = await request(app).post("/api/auth/sign-in/anonymous").send({});

  expect(res.status).toBe(200);

  return {
    id: userBody.parse(res.body).user.id,
    cookies: res.get("Set-Cookie") ?? [],
  };
}

type Outcome = [string, number];

async function runSuite(actor: Account, tag: string): Promise<Outcome[]> {
  const peer = await signUp(`peer${tag}`);
  const kicked = await signUp(`kicked${tag}`);
  const banned = await signUp(`banned${tag}`);

  const outcomes: Outcome[] = [];

  const record = async (
    label: string,
    call: () => Promise<{ status: number }>,
  ): Promise<{ status: number; body?: unknown }> => {
    const res = (await call()) as { status: number; body?: unknown };

    outcomes.push([label, res.status]);

    return res;
  };

  const created = await record("create a server", () =>
    request(app)
      .post("/api/v1/servers")
      .set("Cookie", actor.cookies)
      .send({ name: `Parity ${tag}` }),
  );

  const serverId = idBody.parse(created.body).id;

  await record("read the server", () =>
    request(app)
      .get(`/api/v1/servers/${serverId}`)
      .set("Cookie", actor.cookies),
  );

  await record("rename the server", () =>
    request(app)
      .patch(`/api/v1/servers/${serverId}`)
      .set("Cookie", actor.cookies)
      .send({ name: `Renamed ${tag}` }),
  );

  const listed = await request(app)
    .get(`/api/v1/servers/${serverId}/channels`)
    .set("Cookie", actor.cookies);

  const [defaultChannel] = channelList.parse(listed.body);
  const channelId = defaultChannel?.id ?? "";

  const madeChannel = await record("create a channel", () =>
    request(app)
      .post(`/api/v1/servers/${serverId}/channels`)
      .set("Cookie", actor.cookies)
      .send({ type: "text", name: "parity" }),
  );

  const extraChannelId = idBody.parse(madeChannel.body).id;

  await record("rename a channel", () =>
    request(app)
      .patch(`/api/v1/channels/${extraChannelId}`)
      .set("Cookie", actor.cookies)
      .send({ topic: "renamed" }),
  );

  const madeRole = await record("create a role", () =>
    request(app)
      .post(`/api/v1/servers/${serverId}/roles`)
      .set("Cookie", actor.cookies)
      .send({ name: "Helper" }),
  );

  const roleId = idBody.parse(madeRole.body).id;

  await record("edit a role", () =>
    request(app)
      .patch(`/api/v1/servers/${serverId}/roles/${roleId}`)
      .set("Cookie", actor.cookies)
      .send({ name: "Helper II" }),
  );

  const invited = await record("create an invite", () =>
    request(app)
      .post(`/api/v1/servers/${serverId}/invites`)
      .set("Cookie", actor.cookies)
      .send({}),
  );

  const code = codeBody.parse(invited.body).code;

  for (const joiner of [peer, kicked, banned]) {
    const redeemed = await request(app)
      .post(`/api/v1/invites/${code}`)
      .set("Cookie", joiner.cookies);

    expect(redeemed.status).toBe(200);
  }

  await record("redeem an invite twice over", () =>
    request(app).post(`/api/v1/invites/${code}`).set("Cookie", peer.cookies),
  );

  await record("assign a role", () =>
    request(app)
      .put(`/api/v1/servers/${serverId}/members/${peer.id}/roles/${roleId}`)
      .set("Cookie", actor.cookies),
  );

  await record("unassign a role", () =>
    request(app)
      .delete(`/api/v1/servers/${serverId}/members/${peer.id}/roles/${roleId}`)
      .set("Cookie", actor.cookies),
  );

  await record("write a role overwrite", () =>
    request(app)
      .put(`/api/v1/channels/${extraChannelId}/overwrites/roles/${roleId}`)
      .set("Cookie", actor.cookies)
      .send({ allow: 0, deny: 2 }),
  );

  await record("clear a role overwrite", () =>
    request(app)
      .delete(`/api/v1/channels/${extraChannelId}/overwrites/roles/${roleId}`)
      .set("Cookie", actor.cookies),
  );

  await record("write a member overwrite", () =>
    request(app)
      .put(`/api/v1/channels/${extraChannelId}/overwrites/members/${peer.id}`)
      .set("Cookie", actor.cookies)
      .send({ allow: 0, deny: 2 }),
  );

  await record("clear a member overwrite", () =>
    request(app)
      .delete(
        `/api/v1/channels/${extraChannelId}/overwrites/members/${peer.id}`,
      )
      .set("Cookie", actor.cookies),
  );

  await record("kick a member", () =>
    request(app)
      .delete(`/api/v1/servers/${serverId}/members/${kicked.id}`)
      .set("Cookie", actor.cookies),
  );

  await record("ban a member", () =>
    request(app)
      .put(`/api/v1/servers/${serverId}/bans/${banned.id}`)
      .set("Cookie", actor.cookies)
      .send({ reason: "parity" }),
  );

  await record("list bans", () =>
    request(app)
      .get(`/api/v1/servers/${serverId}/bans`)
      .set("Cookie", actor.cookies),
  );

  await record("unban a member", () =>
    request(app)
      .delete(`/api/v1/servers/${serverId}/bans/${banned.id}`)
      .set("Cookie", actor.cookies),
  );

  await record("read the audit log", () =>
    request(app)
      .get(`/api/v1/servers/${serverId}/audit-log`)
      .set("Cookie", actor.cookies),
  );

  const sent = await record("send a message", () =>
    request(app)
      .post(`/api/v1/channels/${channelId}/messages`)
      .set("Cookie", actor.cookies)
      .send({ content: "parity", nonce: randomUUID() }),
  );

  const messageId = idBody.parse(sent.body).id;

  await record("reply to a message", () =>
    request(app)
      .post(`/api/v1/channels/${channelId}/messages`)
      .set("Cookie", actor.cookies)
      .send({ content: "quoted", nonce: randomUUID(), replyToId: messageId }),
  );

  await record("edit a message", () =>
    request(app)
      .patch(`/api/v1/channels/${channelId}/messages/${messageId}`)
      .set("Cookie", actor.cookies)
      .send({ content: "parity, edited" }),
  );

  await record("react to a message", () =>
    request(app)
      .put(
        `/api/v1/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent("👍")}`,
      )
      .set("Cookie", actor.cookies),
  );

  await record("pin a message", () =>
    request(app)
      .put(`/api/v1/channels/${channelId}/messages/${messageId}/pin`)
      .set("Cookie", actor.cookies),
  );

  await record("unpin a message", () =>
    request(app)
      .delete(`/api/v1/channels/${channelId}/messages/${messageId}/pin`)
      .set("Cookie", actor.cookies),
  );

  await record("mark a channel read", () =>
    request(app)
      .put(`/api/v1/channels/${channelId}/read`)
      .set("Cookie", actor.cookies)
      .send({ messageId }),
  );

  await record("delete a message", () =>
    request(app)
      .delete(`/api/v1/channels/${channelId}/messages/${messageId}`)
      .set("Cookie", actor.cookies),
  );

  await record("open a direct message", () =>
    request(app)
      .post("/api/v1/dms")
      .set("Cookie", actor.cookies)
      .send({ recipientId: peer.id }),
  );

  await record("search the archive", () =>
    request(app)
      .get(`/api/v1/search?q=parity&server_id=${serverId}`)
      .set("Cookie", actor.cookies),
  );

  await record("request an upload grant", () =>
    request(app).post("/api/v1/uploads").set("Cookie", actor.cookies).send({
      kind: "attachment",
      filename: "parity.png",
      contentType: "image/png",
      size: 1024,
    }),
  );

  await record("delete a role", () =>
    request(app)
      .delete(`/api/v1/servers/${serverId}/roles/${roleId}`)
      .set("Cookie", actor.cookies),
  );

  await record("delete a channel", () =>
    request(app)
      .delete(`/api/v1/channels/${extraChannelId}`)
      .set("Cookie", actor.cookies),
  );

  await record("transfer ownership", () =>
    request(app)
      .post(`/api/v1/servers/${serverId}/owner`)
      .set("Cookie", actor.cookies)
      .send({ userId: peer.id }),
  );

  await record("rename the server after handing it over", () =>
    request(app)
      .patch(`/api/v1/servers/${serverId}`)
      .set("Cookie", actor.cookies)
      .send({ name: "not mine" }),
  );

  await record("delete the server after handing it over", () =>
    request(app)
      .delete(`/api/v1/servers/${serverId}`)
      .set("Cookie", actor.cookies),
  );

  return outcomes;
}

function sourceFiles(root: string): string[] {
  const found: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith(".ts")) {
        found.push(path);
      }
    }
  };

  walk(root);

  return found;
}

describe("guest capability parity", () => {
  beforeAll(requireTestDatabase);

  it("answers a registered and an anonymous session identically", async () => {
    const registered = await runSuite(await signUp("registered"), "reg");
    const anonymous = await runSuite(await signInAnonymously(), "anon");

    expect(anonymous.map(([label]) => label)).toEqual(
      registered.map(([label]) => label),
    );

    expect(anonymous).toEqual(registered);

    expect(registered.length).toBeGreaterThanOrEqual(30);
    expect(
      registered.filter(([, status]) => status >= 400).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("reads is_anonymous nowhere that decides whether an action is allowed", () => {
    const authorizationPaths = [
      ...sourceFiles(join("src", "access")),
      ...sourceFiles(join("src", "middleware")),
      ...sourceFiles(join("src", "modules")).filter(
        (path) => !path.includes(join("modules", "demo")),
      ),
    ]
      .filter((path) => !path.includes(join("modules", "dms")))
      .filter((path) => path !== join("src", "modules", "users", "queries.ts"));

    const offenders = authorizationPaths.filter((path) =>
      /isAnonymous|is_anonymous/.test(readFileSync(path, "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("keeps the readers to the five the design names", () => {
    const allowed = [
      join("src", "auth.ts"),
      join("src", "lib", "quota.ts"),
      join("src", "modules", "demo", "service.ts"),
      join("src", "modules", "dms", "service.ts"),
      join("src", "jobs", "ambient-activity.ts"),
      join("src", "jobs", "guest-anonymize.ts"),
      join("src", "jobs", "guest-expiry.ts"),
      join("src", "db", "schema", "auth.ts"),
      join("src", "modules", "users", "queries.ts"),
    ];

    const readers = sourceFiles("src").filter((path) =>
      /isAnonymous|is_anonymous/.test(readFileSync(path, "utf8")),
    );

    expect(readers.toSorted()).toEqual(allowed.toSorted());
  });
});
