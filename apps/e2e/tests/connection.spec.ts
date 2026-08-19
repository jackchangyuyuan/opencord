import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

const password = "correct horse battery staple";

test("renders the SPA and reports the serving instance", async ({ page }) => {
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    data: {
      email: `e2e-${randomUUID()}@example.com`,
      name: "E2E",
      password,
    },
  });

  expect(signUp.status()).toBe(200);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "OpenCord" })).toBeVisible();
  await expect(page.getByText(/^connected · /)).toBeVisible();
});
