import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { type Account, signUp } from "./fixtures/accounts.js";

const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:5173";

const VIEW_CHANNEL = 1 << 0;

async function openApp(account: Account, channelId: string) {
  await account.context.addCookies([
    { name: account.cookie.name, value: account.cookie.value, url: baseURL },
  ]);

  const page = await account.context.newPage();

  await page.goto(`/app/channels/${channelId}`);
  await expect(page.getByTestId("socket-status")).toHaveText("Connected");

  return page;
}

test("hides a private channel and refuses a foreign delete (flow 4)", async ({
  browser,
}) => {
  const owner = await signUp(browser, "owner");
  const member = await signUp(browser, "member");

  const created = await owner.request.post("/api/v1/servers", {
    data: { name: `Perms ${randomUUID().slice(0, 8)}` },
  });

  expect(created.status()).toBe(201);

  const { id: serverId } = (await created.json()) as { id: string };

  const invited = await owner.request.post(
    `/api/v1/servers/${serverId}/invites`,
    { data: {} },
  );

  expect(invited.status()).toBe(201);

  const { code } = (await invited.json()) as { code: string };

  expect((await member.request.post(`/api/v1/invites/${code}`)).status()).toBe(
    200,
  );

  const secret = await owner.request.post(
    `/api/v1/servers/${serverId}/channels`,
    { data: { type: "text", name: "secret" } },
  );

  expect(secret.status()).toBe(201);

  const { id: secretId } = (await secret.json()) as { id: string };

  const listed = await owner.request.get(
    `/api/v1/servers/${serverId}/channels`,
  );

  const channels = (await listed.json()) as { id: string; name: string }[];
  const general = channels.find((channel) => channel.id !== secretId);

  if (general === undefined) {
    throw new Error("the new server has no default channel");
  }

  const memberPage = await openApp(member, general.id);

  await expect(memberPage.getByRole("link", { name: "secret" })).toBeVisible();

  const roles = await owner.request.get(`/api/v1/servers/${serverId}/roles`);
  const everyone = (
    (await roles.json()) as {
      id: string;
      isDefault: boolean;
    }[]
  ).find((role) => role.isDefault);

  if (everyone === undefined) {
    throw new Error("the server has no @everyone role");
  }

  const denied = await owner.request.put(
    `/api/v1/channels/${secretId}/overwrites/roles/${everyone.id}`,
    { data: { allow: 0, deny: VIEW_CHANNEL } },
  );

  expect(denied.status()).toBe(200);

  await expect(memberPage.getByRole("link", { name: "secret" })).toBeHidden({
    timeout: 15_000,
  });

  const peeked = await member.request.get(`/api/v1/channels/${secretId}`);

  expect(peeked.status()).toBe(404);

  const sent = await owner.request.post(
    `/api/v1/channels/${general.id}/messages`,
    { data: { content: "the owner's message", nonce: randomUUID() } },
  );

  expect(sent.status()).toBe(201);

  const { id: messageId } = (await sent.json()) as { id: string };

  const refused = await member.request.delete(
    `/api/v1/channels/${general.id}/messages/${messageId}`,
  );

  expect(refused.status()).toBe(403);

  await owner.context.close();
  await member.context.close();
});
