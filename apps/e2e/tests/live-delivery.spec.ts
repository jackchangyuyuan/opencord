import { randomUUID } from "node:crypto";

import {
  type APIRequestContext,
  type Browser,
  expect,
  test,
} from "@playwright/test";

const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:5173";

const password = "correct horse battery staple";

interface Fixture {
  cookie: { name: string; value: string };
  channelId: string;
}

async function seed(request: APIRequestContext): Promise<Fixture> {
  const id = randomUUID();

  const signUp = await request.post("/api/auth/sign-up/email", {
    data: {
      email: `live-${id}@example.com`,
      name: "Live",
      password,
      username: `live${id.slice(0, 8)}`,
    },
  });

  expect(signUp.status()).toBe(200);

  const created = await request.post("/api/v1/servers", {
    data: { name: `Live ${id.slice(0, 8)}` },
  });

  expect(created.status()).toBe(201);

  const { id: serverId } = (await created.json()) as { id: string };

  const listed = await request.get(`/api/v1/servers/${serverId}/channels`);
  const channels = (await listed.json()) as { id: string }[];
  const [channel] = channels;

  if (channel === undefined) {
    throw new Error("the new server has no channel");
  }

  const cookies = await request.storageState();
  const session = cookies.cookies.find(
    (entry) => entry.name === "better-auth.session_token",
  );

  if (session === undefined) {
    throw new Error("sign-up returned no session cookie");
  }

  return {
    cookie: { name: session.name, value: session.value },
    channelId: channel.id,
  };
}

async function openWindow(browser: Browser, fixture: Fixture) {
  const context = await browser.newContext({ baseURL });

  await context.addCookies([
    {
      name: fixture.cookie.name,
      value: fixture.cookie.value,
      url: baseURL,
    },
  ]);

  const page = await context.newPage();

  await page.goto(`/app/channels/${fixture.channelId}`);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect(page.getByText(/^connected/)).toBeVisible();

  return { context, page };
}

test("delivers a message live to a second window (flow 2)", async ({
  browser,
  request,
}) => {
  const fixture = await seed(request);

  const sender = await openWindow(browser, fixture);
  const watcher = await openWindow(browser, fixture);

  const body = `live delivery ${randomUUID().slice(0, 8)}`;

  await sender.page.getByRole("textbox", { name: "Message" }).fill(body);
  await sender.page.getByRole("button", { name: "Send message" }).click();

  await expect(
    sender.page.getByTestId("message-content").getByText(body),
  ).toBeVisible();
  await expect(
    watcher.page.getByTestId("message-content").getByText(body),
  ).toBeVisible();
  await expect(watcher.page.getByRole("status")).toHaveText(body);

  await sender.context.close();
  await watcher.context.close();
});
