import { randomUUID } from "node:crypto";

import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  type Route,
  test,
} from "@playwright/test";

const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:5173";

const password = "correct horse battery staple";

const LIST_DELAY_MS = 2_000;

interface Room {
  reader: BrowserContext;
  writer: BrowserContext;
  channelId: string;
  otherChannelId: string;
}

async function signUp(
  browser: Browser,
  prefix: string,
): Promise<BrowserContext> {
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

  return context;
}

async function post(
  account: BrowserContext,
  channelId: string,
  content: string,
) {
  const sent = await account.request.post(
    `/api/v1/channels/${channelId}/messages`,
    { data: { content, nonce: randomUUID() } },
  );

  expect(sent.status()).toBe(201);
}

async function seed(browser: Browser): Promise<Room> {
  const reader = await signUp(browser, "divider");
  const writer = await signUp(browser, "dividerother");

  const created = await reader.request.post("/api/v1/servers", {
    data: { name: `Divider ${randomUUID().slice(0, 8)}` },
  });

  expect(created.status()).toBe(201);

  const { id: serverId } = (await created.json()) as { id: string };

  const listed = await reader.request.get(
    `/api/v1/servers/${serverId}/channels`,
  );
  const channels = (await listed.json()) as { id: string }[];
  const [first, second] = channels;

  if (first === undefined || second === undefined) {
    throw new Error("the new server has fewer than two channels");
  }

  const invited = await reader.request.post(
    `/api/v1/servers/${serverId}/invites`,
    { data: {} },
  );
  const { code } = (await invited.json()) as { code: string };

  expect((await writer.request.post(`/api/v1/invites/${code}`)).status()).toBe(
    200,
  );

  return {
    reader,
    writer,
    channelId: first.id,
    otherChannelId: second.id,
  };
}

async function readState(room: Room) {
  const state = await room.reader.request.get(
    `/api/v1/channels/${room.channelId}/read`,
  );

  return (await state.json()) as {
    lastReadMessageId: string | null;
    unreadCount: number;
  };
}

function dividerRow(page: Page) {
  return page.locator('[data-row-key]:has([data-slot="new-messages-divider"])');
}

test("marks the boundary between what was read and what arrived (flow 6)", async ({
  browser,
}) => {
  const room = await seed(browser);

  await post(room.writer, room.channelId, "read before leaving");

  const page = await room.reader.newPage();

  await page.goto(`/app/channels/${room.channelId}`);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect(page.getByTestId("socket-status")).toHaveText("Connected");
  await expect.poll(async () => (await readState(room)).unreadCount).toBe(0);

  await page.goto(`/app/channels/${room.otherChannelId}`);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();

  await post(room.writer, room.channelId, "arrived while away");
  await post(room.writer, room.channelId, "and one more");

  await page.goto(`/app/channels/${room.channelId}`);

  await expect(dividerRow(page)).toContainText("arrived while away");
  await expect(dividerRow(page)).toHaveCount(1);

  await page.close();
});

test("marks the boundary when the channel list arrives last (flow 6)", async ({
  browser,
}) => {
  const room = await seed(browser);

  await post(room.writer, room.channelId, "read before reloading");

  const page = await room.reader.newPage();

  await page.goto(`/app/channels/${room.channelId}`);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect.poll(async () => (await readState(room)).unreadCount).toBe(0);

  await post(room.writer, room.channelId, "arrived while away");
  await post(room.writer, room.channelId, "and one more");

  await expect.poll(async () => (await readState(room)).unreadCount).toBe(2);

  await page.route("**/api/v1/servers/*/channels", async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, LIST_DELAY_MS));
    await route.continue();
  });

  await page.goto(`/app/channels/${room.channelId}`);
  await expect(
    page.getByTestId("message-content").getByText("and one more"),
  ).toBeVisible();

  await expect(dividerRow(page)).toContainText("arrived while away");
  await expect(dividerRow(page)).toHaveCount(1);

  await expect.poll(async () => (await readState(room)).unreadCount).toBe(0);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.close();
});
