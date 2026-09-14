import { randomUUID } from "node:crypto";

import {
  type APIRequestContext,
  type Browser,
  expect,
  test,
} from "@playwright/test";

const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:5173";

const password = "correct horse battery staple";

const BACKGROUND = "background";

interface Fixture {
  cookie: { name: string; value: string };
  serverId: string;
  openChannelId: string;
  backgroundChannelId: string;
  other: APIRequestContext;
}

async function signUp(
  request: APIRequestContext,
  prefix: string,
): Promise<void> {
  const id = randomUUID();

  const created = await request.post("/api/auth/sign-up/email", {
    data: {
      email: `${prefix}-${id}@example.com`,
      name: prefix,
      password,
      username: `${prefix}${id.slice(0, 8)}`,
    },
  });

  expect(created.status()).toBe(200);
}

async function seed(
  request: APIRequestContext,
  browser: Browser,
): Promise<Fixture> {
  const id = randomUUID();

  await signUp(request, "unread");

  const created = await request.post("/api/v1/servers", {
    data: { name: `Unread ${id.slice(0, 8)}` },
  });

  expect(created.status()).toBe(201);

  const { id: serverId } = (await created.json()) as { id: string };

  const background = await request.post(
    `/api/v1/servers/${serverId}/channels`,
    { data: { type: "text", name: BACKGROUND } },
  );

  expect(background.status()).toBe(201);

  const { id: backgroundChannelId } = (await background.json()) as {
    id: string;
  };

  const listed = await request.get(`/api/v1/servers/${serverId}/channels`);
  const channels = (await listed.json()) as { id: string; name: string }[];
  const open = channels.find((channel) => channel.id !== backgroundChannelId);

  if (open === undefined) {
    throw new Error("the new server has no default channel");
  }

  const state = await request.storageState();
  const session = state.cookies.find(
    (entry) => entry.name === "better-auth.session_token",
  );

  if (session === undefined) {
    throw new Error("sign-up returned no session cookie");
  }

  const invited = await request.post(`/api/v1/servers/${serverId}/invites`, {
    data: {},
  });

  expect(invited.status()).toBe(201);

  const { code } = (await invited.json()) as { code: string };

  const otherContext = await browser.newContext({ baseURL });

  await signUp(otherContext.request, "unreadother");

  const joined = await otherContext.request.post(`/api/v1/invites/${code}`);

  expect(joined.status()).toBe(200);

  return {
    cookie: { name: session.name, value: session.value },
    serverId,
    openChannelId: open.id,
    backgroundChannelId,
    other: otherContext.request,
  };
}

async function openWindow(browser: Browser, fixture: Fixture) {
  const context = await browser.newContext({ baseURL });

  await context.addCookies([
    { name: fixture.cookie.name, value: fixture.cookie.value, url: baseURL },
  ]);

  const page = await context.newPage();

  await page.goto(`/app/channels/${fixture.openChannelId}`);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect(page.getByTestId("socket-status")).toHaveText("Connected");

  return { context, page };
}

test("badges a background channel and clears it on visit (flow 6)", async ({
  browser,
  request,
}) => {
  const fixture = await seed(request, browser);
  const { context, page } = await openWindow(browser, fixture);

  const badge = page.getByText(`${BACKGROUND}: unread messages`);
  const link = page.getByRole("link", { name: BACKGROUND });

  await expect(link).toBeVisible();
  await expect(badge).toBeHidden();

  const mine = await request.post(
    `/api/v1/channels/${fixture.backgroundChannelId}/messages`,
    { data: { content: "written by me", nonce: randomUUID() } },
  );

  expect(mine.status()).toBe(201);
  await expect(badge).toBeHidden();

  const sent = await fixture.other.post(
    `/api/v1/channels/${fixture.backgroundChannelId}/messages`,
    { data: { content: "over here", nonce: randomUUID() } },
  );

  expect(sent.status()).toBe(201);

  await expect(badge).toBeVisible();

  await link.click();

  await expect(
    page.getByTestId("message-content").getByText("over here"),
  ).toBeVisible();

  await expect(
    page.locator('[data-slot="new-messages-divider"]'),
  ).toBeInViewport();

  await expect(badge).toBeHidden();

  await context.close();
});
