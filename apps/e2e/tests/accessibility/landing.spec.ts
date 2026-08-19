import { expect, test } from "../fixtures/index.js";

test.describe("landing screen", { tag: "@a11y" }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "OpenCord" })).toBeVisible();
  });

  test("has no WCAG 2.2 A or AA violations in the light theme", async ({
    makeAxeBuilder,
  }) => {
    const { violations } = await makeAxeBuilder().analyze();

    expect(violations).toEqual([]);
  });

  test("has no WCAG 2.2 A or AA violations in the dark theme", async ({
    page,
    makeAxeBuilder,
  }) => {
    await page.getByRole("button", { name: "Dark" }).click();
    await expect(page.getByRole("button", { name: "Light" })).toBeVisible();

    const { violations } = await makeAxeBuilder().analyze();

    expect(violations).toEqual([]);
  });
});
