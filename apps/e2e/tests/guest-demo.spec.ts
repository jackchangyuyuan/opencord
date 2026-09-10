import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

const password = "correct horse battery staple";

test("enters the demo, sends, claims and signs back in (flow 1)", async ({
  page,
}) => {
  const id = randomUUID().slice(0, 8);
  const username = `claim${id}`;
  const email = `claim-${id}@example.com`;

  const rail = page.getByRole("navigation", { name: "Servers and channels" });
  const sandbox = rail.getByRole("button", { name: /^Your sandbox/ });

  await page.goto("/");
  await page.getByRole("button", { name: "Enter demo — no signup" }).click();

  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect(page.getByTestId("socket-status")).toHaveText("Connected");
  await expect(page.getByTestId("message-content").first()).toBeVisible();
  await expect(sandbox).toBeVisible();
  await expect(page.getByText(/: unread messages$/).first()).toBeVisible();

  const body = `guest demo ${id}`;

  await page.getByRole("textbox", { name: "Message" }).fill(body);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(
    page.getByTestId("message-content").getByText(body),
  ).toBeVisible();

  const guide = page.getByRole("complementary", { name: "Try these" });

  await guide.getByRole("button", { name: "Save my account" }).click();

  const dialog = page.getByRole("dialog", { name: "Save my account" });

  await dialog.getByLabel("Username").fill(username);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Password").fill(password);
  await dialog.getByRole("button", { name: "Save my account" }).click();

  await expect(guide).toBeHidden();
  await expect(
    page.getByTestId("message-content").getByText(body),
  ).toBeVisible();
  await expect(sandbox).toBeVisible();

  const channel = new URL(page.url()).pathname;

  await page
    .getByRole("navigation", { name: "Servers and channels" })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL(`/?from=${encodeURIComponent(channel)}`);

  await page.getByRole("link", { name: "sign in" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(channel);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  await expect(sandbox).toBeVisible();
  await expect(
    page.getByTestId("message-content").getByText(body),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Try these" }),
  ).toBeHidden();
});
