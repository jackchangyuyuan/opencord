import { randomUUID } from "node:crypto";

import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  test,
} from "@playwright/test";

const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:5173";

const password = "correct horse battery staple";

const VIEW_CHANNEL = 1 << 0;

const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

interface Account {
  id: string;
  cookie: { name: string; value: string };
  request: APIRequestContext;
  context: BrowserContext;
}

async function signUp(browser: Browser, prefix: string): Promise<Account> {
  const context = await browser.newContext({ baseURL });
  const id = randomUUID();

  const created = await context.request.post("/api/auth/sign-up/email", {
    data: {
      email: `${prefix}-${id}@example.com`,
      name: prefix,
      password,
      username: `${prefix}${id.slice(0, 8)}`,
    },
  });

  expect(created.status()).toBe(200);

  const { user } = (await created.json()) as { user: { id: string } };

  const session = (await context.request.storageState()).cookies.find(
    (entry) => entry.name === "better-auth.session_token",
  );

  if (session === undefined) {
    throw new Error("sign-up returned no session cookie");
  }

  return {
    id: user.id,
    cookie: { name: session.name, value: session.value },
    request: context.request,
    context,
  };
}

async function upload(account: Account): Promise<string> {
  const authorized = await account.request.post("/api/v1/uploads", {
    data: {
      kind: "attachment",
      filename: "pixel.png",
      contentType: "image/png",
      size: PIXEL.byteLength,
    },
  });

  expect(authorized.status()).toBe(201);

  const grant = (await authorized.json()) as {
    objectKey: string;
    upload: { url: string; fields: Record<string, string> };
  };

  const multipart: Record<
    string,
    string | { name: string; mimeType: string; buffer: Buffer }
  > = { ...grant.upload.fields };

  multipart["file"] = {
    name: "pixel.png",
    mimeType: "image/png",
    buffer: PIXEL,
  };

  const stored = await account.request.post(grant.upload.url, { multipart });

  expect(stored.status()).toBeLessThan(300);

  return grant.objectKey;
}

async function postWithImage(
  account: Account,
  channelId: string,
  content: string,
): Promise<string> {
  const objectKey = await upload(account);

  const sent = await account.request.post(
    `/api/v1/channels/${channelId}/messages`,
    {
      data: {
        content,
        nonce: randomUUID(),
        attachments: [{ objectKey, filename: "pixel.png" }],
      },
    },
  );

  expect(sent.status()).toBe(201);

  return objectKey;
}

test("search and media stop at the same permission boundary (flow 5)", async ({
  browser,
}) => {
  const owner = await signUp(browser, "owner");
  const member = await signUp(browser, "member");
  const term = `zylophone${randomUUID().slice(0, 8)}`;

  const created = await owner.request.post("/api/v1/servers", {
    data: { name: `Media ${randomUUID().slice(0, 8)}` },
  });

  expect(created.status()).toBe(201);

  const { id: serverId } = (await created.json()) as { id: string };

  const invited = await owner.request.post(
    `/api/v1/servers/${serverId}/invites`,
    { data: {} },
  );

  const { code } = (await invited.json()) as { code: string };

  expect((await member.request.post(`/api/v1/invites/${code}`)).status()).toBe(
    200,
  );

  const listed = await owner.request.get(
    `/api/v1/servers/${serverId}/channels`,
  );

  const [general] = (await listed.json()) as { id: string; name: string }[];

  if (general === undefined) {
    throw new Error("the new server has no default channel");
  }

  const secret = await owner.request.post(
    `/api/v1/servers/${serverId}/channels`,
    { data: { type: "text", name: "secret" } },
  );

  const { id: secretId } = (await secret.json()) as { id: string };

  const publicKey = await postWithImage(
    owner,
    general.id,
    `a public ${term} note`,
  );
  const secretKey = await postWithImage(
    owner,
    secretId,
    `a private ${term} note`,
  );

  const roles = await owner.request.get(`/api/v1/servers/${serverId}/roles`);
  const everyone = (
    (await roles.json()) as { id: string; isDefault: boolean }[]
  ).find((role) => role.isDefault);

  if (everyone === undefined) {
    throw new Error("the server has no @everyone role");
  }

  expect(
    (
      await owner.request.put(
        `/api/v1/channels/${secretId}/overwrites/roles/${everyone.id}`,
        { data: { allow: 0, deny: VIEW_CHANNEL } },
      )
    ).status(),
  ).toBe(200);

  const found = await member.request.get(
    `/api/v1/search?q=${encodeURIComponent(term)}&server_id=${serverId}`,
  );

  expect(found.status()).toBe(200);

  const payload = await found.text();
  const results = (
    JSON.parse(payload) as {
      data: { channelId: string; attachments: { url: string }[] }[];
    }
  ).data;

  expect(results).toHaveLength(1);
  expect(results[0]?.channelId).toBe(general.id);
  expect(payload).not.toContain(secretKey);
  expect(payload).toContain(publicKey);
  expect(results[0]?.attachments[0]?.url).toContain(publicKey);

  await member.context.addCookies([
    { name: member.cookie.name, value: member.cookie.value, url: baseURL },
  ]);

  const page = await member.context.newPage();

  await page.goto(`/app/channels/${general.id}`);
  await expect(page.getByTestId("socket-status")).toHaveText("Connected");

  const image = page.getByRole("img", { name: "pixel.png" });

  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", new RegExp(publicKey));

  await page.getByRole("button", { name: "Search" }).first().click();
  await page.getByRole("textbox", { name: "Search messages" }).fill(term);
  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expect(page.getByText(`a public ${term} note`)).toBeVisible();
  await expect(page.getByText(`a private ${term} note`)).toBeHidden();

  await owner.context.close();
  await member.context.close();
});
