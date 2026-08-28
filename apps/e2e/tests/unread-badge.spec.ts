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
}

async function seed(request: APIRequestContext): Promise<Fixture> {
  const id = randomUUID();

  const signUp = await request.post("/api/auth/sign-up/email", {
    data: {
      email: `unread-${id}@example.com`,
      name: "Unread",
      password,
      username: `unread${id.slice(0, 8)}`,
    },
  });

  expect(signUp.status()).toBe(200);

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

  return {
    cookie: { name: session.name, value: session.value },
    serverId,
    openChannelId: open.id,
    backgroundChannelId,
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
  const fixture = await seed(request);
  const { context, page } = await openWindow(browser, fixture);

  const badge = page.getByText(`${BACKGROUND}: unread messages`);
  const link = page.getByRole("link", { name: BACKGROUND });

  await expect(link).toBeVisible();
  await expect(badge).toBeHidden();

  const sent = await request.post(
    `/api/v1/channels/${fixture.backgroundChannelId}/messages`,
    { data: { content: "over here", nonce: randomUUID() } },
  );

  expect(sent.status()).toBe(201);

  await expect(badge).toBeVisible();

  await link.click();

  await expect(
    page.getByTestId("message-content").getByText("over here"),
  ).toBeVisible();

  await expect(badge).toBeHidden();

  await context.close();
});
