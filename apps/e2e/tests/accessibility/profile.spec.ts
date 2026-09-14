import { expect, test, THEMES } from "../fixtures/index.js";

test.describe("the profile card", { tag: "@a11y" }, () => {
  for (const theme of THEMES) {
    test(`has no WCAG 2.2 A or AA violations in the ${theme} theme`, async ({
      page,
      makeAxeBuilder,
      enterDemo,
    }) => {
      await enterDemo(theme);

      const roster = page.getByRole("complementary", { name: "Members" });
      const trigger = roster
        .getByRole("button", { name: /'s profile$/ })
        .first();

      await expect(trigger).toBeVisible({ timeout: 15_000 });
      await trigger.click();

      await expect(page.getByText(/^@seed-/).first()).toBeVisible();

      const { violations } = await makeAxeBuilder().analyze();

      expect(violations).toEqual([]);
    });
  }
});

test.describe("the mention menu", { tag: "@a11y" }, () => {
  for (const theme of THEMES) {
    test(`has no WCAG 2.2 A or AA violations in the ${theme} theme`, async ({
      page,
      makeAxeBuilder,
      enterDemo,
    }) => {
      await enterDemo(theme);

      await page.getByRole("textbox", { name: "Message" }).fill("@s");

      const menu = page.getByRole("listbox", { name: "Mentions" });

      await expect(menu).toBeVisible({ timeout: 15_000 });
      await expect(menu.getByRole("option").first()).toBeVisible();

      const { violations } = await makeAxeBuilder().analyze();

      expect(violations).toEqual([]);
    });
  }
});
