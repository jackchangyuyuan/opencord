import { expect, test, THEMES } from "../fixtures/index.js";

test.describe("server settings", { tag: "@a11y" }, () => {
  for (const theme of THEMES) {
    test(`has no WCAG 2.2 A or AA violations in the ${theme} theme`, async ({
      page,
      makeAxeBuilder,
      enterDemo,
    }) => {
      await enterDemo(theme);

      await page
        .getByRole("navigation", { name: "Servers and channels" })
        .getByRole("button", { name: /^Your sandbox/ })
        .click();

      await page.getByRole("button", { name: "Server settings" }).click();

      const dialog = page.getByRole("dialog", { name: "Your sandbox" });

      await expect(dialog).toBeVisible();
      await dialog.getByRole("tab", { name: "Roles" }).click();
      await expect(
        dialog.getByRole("switch", { name: "Manage roles" }),
      ).toBeVisible();

      const { violations } = await makeAxeBuilder().analyze();

      expect(violations).toEqual([]);
    });
  }
});
