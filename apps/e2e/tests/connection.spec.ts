import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

const password = "correct horse battery staple";

test("renders the SPA and reports the serving instance", async ({ page }) => {
  const id = randomUUID();

  const signUp = await page.request.post("/api/auth/sign-up/email", {
    data: {
      email: `e2e-${id}@example.com`,
      name: "E2E",
      password,
      username: `e2e-${id.slice(0, 8)}`,
    },
  });

  expect(signUp.status()).toBe(200);

  await page.goto("/app");

  await expect(page.getByRole("heading", { name: "OpenCord" })).toBeVisible();
  await expect(page.getByText(/^connected · /)).toBeVisible();
});
