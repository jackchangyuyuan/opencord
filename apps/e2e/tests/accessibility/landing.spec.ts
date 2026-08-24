import { expect, test } from "../fixtures/index.js";

test.describe("landing screen", { tag: "@a11y" }, () => {
  test("has no WCAG 2.2 A or AA violations in the light theme", async ({
    page,
    makeAxeBuilder,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "OpenCord" })).toBeVisible();

    const { violations } = await makeAxeBuilder().analyze();

    expect(violations).toEqual([]);
  });

  test("has no WCAG 2.2 A or AA violations in the dark theme", async ({
    page,
    makeAxeBuilder,
  }) => {
    await page.addInitScript(() => {
      document.documentElement.classList.add("dark");
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "OpenCord" })).toBeVisible();

    const { violations } = await makeAxeBuilder().analyze();

    expect(violations).toEqual([]);
  });
});
