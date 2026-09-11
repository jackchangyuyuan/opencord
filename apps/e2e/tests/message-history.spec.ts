import { randomUUID } from "node:crypto";

import {
  type APIRequestContext,
  type Browser,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";

const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:5173";

const password = "correct horse battery staple";

const PAGE_SIZE = 75;
const SEEDED = PAGE_SIZE + 25;

interface Fixture {
  cookie: { name: string; value: string };
  channelId: string;
}

async function seed(request: APIRequestContext): Promise<Fixture> {
  const id = randomUUID().slice(0, 8);

  const signUp = await request.post("/api/auth/sign-up/email", {
    data: {
      email: `history-${id}@example.com`,
      name: "History",
      password,
      username: `history${id}`,
    },
  });

  expect(signUp.status()).toBe(200);

  const created = await request.post("/api/v1/servers", {
    data: { name: `History ${id}` },
  });

  const { id: serverId } = (await created.json()) as { id: string };
  const listed = await request.get(`/api/v1/servers/${serverId}/channels`);
  const [channel] = (await listed.json()) as { id: string }[];

  if (channel === undefined) {
    throw new Error("the new server has no channel");
  }

  for (let index = 0; index < SEEDED; index += 1) {
    const res = await request.post(`/api/v1/channels/${channel.id}/messages`, {
      data: { content: `seeded ${String(index)}`, nonce: randomUUID() },
    });

    expect(
      res.status(),
      "seeding needs the message budget playwright.config.ts gives the API",
    ).toBe(201);
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
    channelId: channel.id,
  };
}

async function openChannel(
  browser: Browser,
  fixture: Fixture,
): Promise<{ close: () => Promise<void>; page: Page }> {
  const context = await browser.newContext();

  await context.addCookies([
    { name: fixture.cookie.name, url: baseURL, value: fixture.cookie.value },
  ]);

  const page = await context.newPage();

  await page.goto(`/app/channels/${fixture.channelId}`);

  return { close: () => context.close(), page };
}

async function wheelUpUntil(
  page: Page,
  settled: () => Promise<boolean>,
): Promise<void> {
  await page.getByTestId("virtuoso-scroller").hover();

  await expect
    .poll(
      async () => {
        await page.mouse.wheel(0, -120);

        return settled();
      },
      { intervals: [80], timeout: 20_000 },
    )
    .toBe(true);
}

function seededMessage(page: Page, index: number): Locator {
  return page.getByText(`seeded ${String(index)}`, { exact: true });
}

test.describe("the virtualised message history", () => {
  test("opens at the newest message and holds its place when older history loads", async ({
    browser,
    request,
  }) => {
    const fixture = await seed(request);
    const { close, page } = await openChannel(browser, fixture);

    const newest = seededMessage(page, SEEDED - 1);
    const oldestOfFirstPage = seededMessage(page, SEEDED - PAGE_SIZE);
    const olderPage = seededMessage(page, SEEDED - PAGE_SIZE - 1);

    await expect(newest).toBeInViewport();
    await expect(oldestOfFirstPage).toBeHidden();

    await wheelUpUntil(page, async () => (await olderPage.count()) > 0);

    await expect(oldestOfFirstPage).toBeInViewport();

    await close();
  });

  test("holds its place when a message arrives while the reader is scrolled up", async ({
    browser,
    request,
  }) => {
    const fixture = await seed(request);
    const { close, page } = await openChannel(browser, fixture);

    const watched = seededMessage(page, SEEDED - 20);

    await expect(seededMessage(page, SEEDED - 1)).toBeInViewport();
    await wheelUpUntil(page, () => watched.isVisible());

    const before = await watched.boundingBox();

    await request.post(`/api/v1/channels/${fixture.channelId}/messages`, {
      data: { content: "live arrival", nonce: randomUUID() },
    });

    await expect(
      page.getByText("live arrival", { exact: true }),
    ).toBeAttached();

    const after = await watched.boundingBox();

    expect(after?.y).toBeCloseTo(before?.y ?? 0, 0);

    await close();
  });
});
