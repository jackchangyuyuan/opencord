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

interface Account {
  id: string;
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

  return { id: user.id, request: context.request, context };
}

test("a guest creates a server and a second user joins it (flow 3)", async ({
  browser,
}) => {
  const guestContext = await browser.newContext({ baseURL });
  const page = await guestContext.newPage();

  await page.goto("/");

  await page.getByRole("button", { name: "Enter demo — no signup" }).click();

  await expect(page.getByTestId("socket-status")).toHaveText("Connected", {
    timeout: 30_000,
  });

  const name = `Guest server ${randomUUID().slice(0, 8)}`;

  const created = await guestContext.request.post("/api/v1/servers", {
    data: { name },
  });

  expect(created.status()).toBe(201);

  const { id: serverId } = (await created.json()) as { id: string };

  const madeChannel = await guestContext.request.post(
    `/api/v1/servers/${serverId}/channels`,
    { data: { type: "text", name: "invited" } },
  );

  expect(madeChannel.status()).toBe(201);

  const { id: channelId } = (await madeChannel.json()) as { id: string };

  const invited = await guestContext.request.post(
    `/api/v1/servers/${serverId}/invites`,
    { data: {} },
  );

  expect(invited.status()).toBe(201);

  const { code } = (await invited.json()) as { code: string };

  await page.goto(`/app/channels/${channelId}`);
  await expect(page.getByTestId("socket-status")).toHaveText("Connected");
  await expect(page.getByRole("link", { name: "invited" })).toBeVisible();

  const joiner = await signUp(browser, "joiner");
  const joinerPage = await joiner.context.newPage();

  await joinerPage.goto(`/invite/${code}`);
  await joinerPage.getByRole("button", { name: "Accept invite" }).click();

  await expect(joinerPage.getByTestId("socket-status")).toHaveText(
    "Connected",
    { timeout: 30_000 },
  );

  const members = await guestContext.request.get(
    `/api/v1/servers/${serverId}/members`,
  );

  const listed = (await members.json()) as {
    data: { user: { id: string } }[];
  };

  expect(listed.data.map((entry) => entry.user.id)).toContain(joiner.id);

  await expect(page.getByText("joiner", { exact: false })).toBeVisible({
    timeout: 15_000,
  });

  await guestContext.close();
  await joiner.context.close();
});
