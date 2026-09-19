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

const PAGE_SIZE = 75;

const OVERFLOW = PAGE_SIZE;

const UNREAD_TAIL = 20;

interface Room {
  reader: BrowserContext;
  writer: BrowserContext;
  channelId: string;
  otherChannelId: string;
  channelName: string;
  otherChannelName: string;
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
  const channels = (await listed.json()) as { id: string; name: string }[];
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
    channelName: first.name,
    otherChannelName: second.name,
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

test("marks the boundary when the channel is entered from its badge (flow 6)", async ({
  browser,
}) => {
  const room = await seed(browser);

  await post(room.writer, room.channelId, "read before leaving");

  const page = await room.reader.newPage();

  await page.goto(`/app/channels/${room.channelId}`);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect(page.getByTestId("socket-status")).toHaveText("Connected");
  await expect.poll(async () => (await readState(room)).unreadCount).toBe(0);

  const away = page.getByRole("link", { name: room.otherChannelName });
  const back = page.getByRole("link", { name: room.channelName });

  await away.click();
  await expect(page).toHaveURL(`/app/channels/${room.otherChannelId}`);

  await post(room.writer, room.channelId, "arrived while away");
  await post(room.writer, room.channelId, "and one more");

  await expect(
    page.getByText(`${room.channelName}: unread messages`),
  ).toBeVisible();

  await back.click();

  await expect(dividerRow(page)).toHaveCount(1);
  await expect(dividerRow(page)).toContainText("arrived while away");
  await expect(
    page.locator('[data-slot="new-messages-divider"]'),
  ).toBeInViewport();

  await expect.poll(async () => (await readState(room)).unreadCount).toBe(0);
  await expect(dividerRow(page)).toContainText("arrived while away");

  await page.close();
});

test("opens with the unread boundary against the top edge (flow 6)", async ({
  browser,
}) => {
  const room = await seed(browser);

  for (let sent = 0; sent < 20; sent += 1) {
    await post(room.writer, room.channelId, `before leaving ${String(sent)}`);
  }

  const page = await room.reader.newPage();

  await page.goto(`/app/channels/${room.channelId}`);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect(page.getByTestId("socket-status")).toHaveText("Connected");
  await expect.poll(async () => (await readState(room)).unreadCount).toBe(0);

  await page.goto(`/app/channels/${room.otherChannelId}`);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();

  await post(room.writer, room.channelId, "arrived while away");

  for (let sent = 0; sent < UNREAD_TAIL; sent += 1) {
    await post(room.writer, room.channelId, `while away ${String(sent)}`);
  }

  await expect
    .poll(async () => (await readState(room)).unreadCount)
    .toBe(UNREAD_TAIL + 1);

  await page.goto(`/app/channels/${room.channelId}`);
  await expect(dividerRow(page)).toContainText("arrived while away");

  const measure = () =>
    page.evaluate(() => {
      const scroller = document.querySelector("[data-virtuoso-scroller]");
      const marker = document.querySelector(
        '[data-slot="new-messages-divider"]',
      );

      if (scroller === null || marker === null) {
        return null;
      }

      const top = scroller.getBoundingClientRect().top;
      const rows = [...scroller.querySelectorAll("[data-row-key]")];
      const at = rows.findIndex((row) => row.contains(marker));
      const boundary = rows[at];

      if (boundary === undefined) {
        return null;
      }

      return {
        boundaryTop: boundary.getBoundingClientRect().top - top,
        markerTop: marker.getBoundingClientRect().top - top,
        readStillShowing: rows
          .slice(0, at)
          .filter((row) => row.getBoundingClientRect().bottom > top + 2).length,
        scrollable: scroller.scrollHeight > scroller.clientHeight + 4,
      };
    });

  // Polled, because the mount lands on the row and a correction pass then pins
  // it flush: Virtuoso resolves an index by summing sizes it has rounded down,
  // which leaves the row a few pixels low until the pin answers. Reading once
  // measures whichever frame the assertion happened to land on. This is a
  // retrying assertion and not a wait -- a placement that never settles fails.
  await expect
    .poll(async () => Math.abs((await measure())?.markerTop ?? -1))
    .toBeLessThanOrEqual(2);

  const placement = await measure();

  expect(placement).not.toBeNull();
  expect(placement?.scrollable).toBe(true);

  expect(Math.abs(placement?.boundaryTop ?? -1)).toBeLessThanOrEqual(2);
  expect(placement?.readStillShowing).toBe(0);

  await page.close();
});

test("draws no boundary when the watermark is older than the first page (flow 6)", async ({
  browser,
}) => {
  const room = await seed(browser);

  await post(room.writer, room.channelId, "read before leaving");

  const page = await room.reader.newPage();

  await page.goto(`/app/channels/${room.channelId}`);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect.poll(async () => (await readState(room)).unreadCount).toBe(0);

  await page.goto(`/app/channels/${room.otherChannelId}`);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();

  for (let sent = 0; sent < PAGE_SIZE + 1; sent += 1) {
    await post(room.writer, room.channelId, `while away ${String(sent)}`);
  }

  await page.goto(`/app/channels/${room.channelId}`);
  await expect(
    page
      .getByTestId("message-content")
      .getByText(`while away ${String(OVERFLOW)}`),
  ).toBeVisible();

  await expect(dividerRow(page)).toHaveCount(0);

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
