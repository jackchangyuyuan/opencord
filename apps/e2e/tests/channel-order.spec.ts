import { randomUUID } from "node:crypto";

import { expect, type Page, test } from "@playwright/test";

import { type Account, signUp } from "./fixtures/accounts.js";

const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:5173";

async function seed(account: Account) {
  const created = await account.request.post("/api/v1/servers", {
    data: { name: `Order ${randomUUID().slice(0, 8)}` },
  });

  expect(created.status()).toBe(201);

  const { id: serverId } = (await created.json()) as { id: string };

  const added = await account.request.post(
    `/api/v1/servers/${serverId}/channels`,
    { data: { type: "text", name: "third" } },
  );

  expect(added.status()).toBe(201);

  const listed = await account.request.get(
    `/api/v1/servers/${serverId}/channels`,
  );

  const channels = (await listed.json()) as { id: string; name: string }[];
  const [first] = channels;

  if (first === undefined) {
    throw new Error("the new server has no channels");
  }

  return { serverId, channels, first };
}

async function openApp(account: Account, channelId: string): Promise<Page> {
  await account.context.addCookies([
    { name: account.cookie.name, value: account.cookie.value, url: baseURL },
  ]);

  const page = await account.context.newPage();

  await page.goto(`/app/channels/${channelId}`);
  await expect(page.getByTestId("socket-status")).toHaveText("Connected");
  await expect(
    page.locator('nav a[href^="/app/channels/"]').first(),
  ).toBeVisible();

  return page;
}

function liveDrag(page: Page, name: string) {
  return page.getByRole("button", { name: `Reorder ${name}`, pressed: true });
}

async function settle(page: Page) {
  // eslint-disable-next-line playwright/no-wait-for-timeout -- see above
  await page.waitForTimeout(250);
}

function dragAnnouncement(page: Page) {
  return page.locator('[id^="DndLiveRegion"]');
}

function channelNames(page: Page): Promise<string[]> {
  return page
    .locator('nav a[href^="/app/channels/"] span.truncate')
    .allInnerTexts();
}

async function dragHandle(page: Page, name: string, onto: string) {
  const handle = page.getByRole("button", { name: `Reorder ${name}` });
  const target = page
    .locator('nav a[href^="/app/channels/"]')
    .filter({ hasText: onto })
    .first();

  const from = await handle.boundingBox();
  const to = await target.boundingBox();

  if (from === null || to === null) {
    throw new Error("the drag handle or its target is not on screen");
  }

  const x = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endY = to.y + to.height / 2;

  await page.mouse.move(x, startY);
  await page.mouse.down();

  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(x, startY + ((endY - startY) * step) / 10, {
      steps: 2,
    });
  }

  await page.mouse.up();
}

test("reorders channels by dragging, and keeps the order across a reload", async ({
  browser,
}) => {
  const owner = await signUp(browser, "chanorder");
  const { serverId, first } = await seed(owner);
  const page = await openApp(owner, first.id);

  const before = await channelNames(page);

  expect(before).toHaveLength(3);

  await dragHandle(page, before[0] ?? "", before[2] ?? "");

  const moved = [before[1], before[2], before[0]];

  await expect
    .poll(() => channelNames(page), { timeout: 5_000 })
    .toEqual(moved);

  expect(new URL(page.url()).pathname).toBe(`/app/channels/${first.id}`);
  await expect(
    page.locator('nav a[aria-current="page"] span.truncate'),
  ).toHaveText(before[0] ?? "");

  await page.reload();
  await expect
    .poll(() => channelNames(page), { timeout: 5_000 })
    .toEqual(moved);

  const listed = await owner.request.get(
    `/api/v1/servers/${serverId}/channels`,
  );

  expect(
    ((await listed.json()) as { name: string }[]).map(
      (channel) => channel.name,
    ),
  ).toEqual(moved);

  await owner.context.close();
});

test("reorders a channel from the keyboard, and puts it back on escape", async ({
  browser,
}) => {
  const owner = await signUp(browser, "chankeys");
  const { first } = await seed(owner);
  const page = await openApp(owner, first.id);

  const before = await channelNames(page);

  const picked = before[0] ?? "";

  await page.getByRole("button", { name: `Reorder ${picked}` }).focus();
  await page.keyboard.press("Space");
  await expect(liveDrag(page, picked)).toBeVisible();
  await settle(page);
  await page.keyboard.press("ArrowDown");
  await expect(dragAnnouncement(page)).toContainText("position 2 of 3");
  await page.keyboard.press("Space");

  const swapped = [before[1], before[0], before[2]];

  await expect
    .poll(() => channelNames(page), { timeout: 5_000 })
    .toEqual(swapped);

  await page.getByRole("button", { name: `Reorder ${picked}` }).focus();
  await page.keyboard.press("Space");
  await expect(liveDrag(page, picked)).toBeVisible();
  await settle(page);
  await page.keyboard.press("ArrowDown");
  await expect(dragAnnouncement(page)).toContainText("is over position");
  await page.keyboard.press("Escape");
  await expect(dragAnnouncement(page)).toContainText("cancelled");

  await expect
    .poll(() => channelNames(page), { timeout: 5_000 })
    .toEqual(swapped);

  await owner.context.close();
});

test("offers no drag handle to a member who may not manage channels", async ({
  browser,
}) => {
  const owner = await signUp(browser, "chanowner");
  const member = await signUp(browser, "chanmember");
  const { serverId, channels, first } = await seed(owner);

  const invite = await owner.request.post(
    `/api/v1/servers/${serverId}/invites`,
    { data: {} },
  );

  expect(invite.status()).toBe(201);

  const { code } = (await invite.json()) as { code: string };
  const joined = await member.request.post(`/api/v1/invites/${code}`);

  expect(joined.status()).toBeLessThan(300);

  const page = await openApp(member, first.id);

  await expect(page.getByRole("button", { name: /^Reorder / })).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Servers and channels" })
      .getByRole("listitem")
      .getByRole("button", { name: /^Edit / }),
  ).toHaveCount(0);

  const refused = await member.request.patch(
    `/api/v1/servers/${serverId}/channels/positions`,
    { data: { channelIds: channels.map((channel) => channel.id).reverse() } },
  );

  expect(refused.status()).toBe(403);

  await owner.context.close();
  await member.context.close();
});
