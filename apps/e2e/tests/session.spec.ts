import { randomUUID } from "node:crypto";

import { type APIRequestContext, expect, test } from "@playwright/test";

const password = "correct horse battery staple";

test("brings the socket up after signing up in place, with no reload (flow 1)", async ({
  page,
}) => {
  const id = randomUUID().slice(0, 8);

  await page.goto("/");

  await page.getByRole("link", { name: "Create an account" }).click();

  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();

  await page.getByLabel("Display name").fill("Session Flow");
  await page.getByLabel("Username").fill(`flow${id}`);
  await page.getByLabel("Email").fill(`flow-${id}@example.com`);
  await page.getByLabel("Password").fill(password);

  let reloads = 0;

  page.on("load", () => {
    reloads += 1;
  });

  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "OpenCord" })).toBeVisible();
  await expect(page.getByText(/^connected · /)).toBeVisible();
  expect(reloads).toBe(0);
});

interface Account {
  email: string;
  channelId: string;
}

async function seedElsewhere(request: APIRequestContext): Promise<Account> {
  const id = randomUUID().slice(0, 8);
  const email = `return-${id}@example.com`;

  const signUp = await request.post("/api/auth/sign-up/email", {
    data: { email, name: "Return To", password, username: `return${id}` },
  });

  expect(signUp.status()).toBe(200);

  const created = await request.post("/api/v1/servers", {
    data: { name: `Return ${id}` },
  });

  const { id: serverId } = (await created.json()) as { id: string };
  const listed = await request.get(`/api/v1/servers/${serverId}/channels`);
  const [channel] = (await listed.json()) as { id: string }[];

  if (channel === undefined) {
    throw new Error("the new server has no channel");
  }

  return { email, channelId: channel.id };
}

test("returns a visitor to the protected page they asked for", async ({
  page,
  request,
}) => {
  const { email, channelId: channel } = await seedElsewhere(request);

  await page.goto(`/app/channels/${channel}`);

  await expect(page).toHaveURL(
    `/?from=${encodeURIComponent(`/app/channels/${channel}`)}`,
  );

  await page.getByRole("link", { name: "Sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(`/app/channels/${channel}`);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
});
