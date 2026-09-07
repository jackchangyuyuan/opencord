import { expect, test, THEMES } from "../fixtures/index.js";

test.describe("the application shell", { tag: "@a11y" }, () => {
  for (const theme of THEMES) {
    test(`has no WCAG 2.2 A or AA violations in the ${theme} theme`, async ({
      page,
      makeAxeBuilder,
      enterDemo,
    }) => {
      await enterDemo(theme);

      await expect(page.getByRole("navigation")).toBeVisible();
      await expect(
        page.getByRole("complementary", { name: "Members" }),
      ).toBeVisible();

      const { violations } = await makeAxeBuilder().analyze();

      expect(violations).toEqual([]);
    });
  }
});
