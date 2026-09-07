import { expect, test, THEMES } from "../fixtures/index.js";

test.describe("search results", { tag: "@a11y" }, () => {
  for (const theme of THEMES) {
    test(`has no WCAG 2.2 A or AA violations in the ${theme} theme`, async ({
      page,
      makeAxeBuilder,
      enterDemo,
    }) => {
      await enterDemo(theme);

      await page.getByRole("button", { name: "Search", exact: true }).click();

      const panel = page.getByRole("complementary", { name: "Search" });

      await panel
        .getByRole("textbox", { name: "Search messages" })
        .fill("release");
      await panel.getByRole("button", { name: "Search", exact: true }).click();

      await expect(panel.getByRole("listitem").first()).toBeVisible();

      const { violations } = await makeAxeBuilder().analyze();

      expect(violations).toEqual([]);
    });
  }
});
