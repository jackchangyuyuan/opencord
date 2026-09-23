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

      const nav = dialog.getByRole("navigation", { name: "Server settings" });

      await expect(nav.getByRole("heading", { name: "Server" })).toBeVisible();
      await expect(
        nav.getByRole("heading", { name: "Moderation" }),
      ).toBeVisible();

      await expect(
        dialog.getByRole("heading", { name: "Overview", level: 2 }),
      ).toBeVisible();

      expect((await makeAxeBuilder().analyze()).violations).toEqual([]);

      await nav.getByRole("button", { name: "Roles" }).click();
      await expect(dialog.getByRole("list", { name: "Roles" })).toBeVisible();
      await dialog.getByRole("tab", { name: "Permissions" }).click();
      await expect(
        dialog.getByRole("switch", { name: "Manage roles" }),
      ).toBeVisible();

      expect((await makeAxeBuilder().analyze()).violations).toEqual([]);

      await dialog.getByRole("tab", { name: "Channels" }).click();
      await dialog
        .getByRole("button", { name: /general/ })
        .first()
        .click();
      await expect(
        dialog.getByRole("radiogroup", { name: "View channel" }),
      ).toBeVisible();

      expect((await makeAxeBuilder().analyze()).violations).toEqual([]);

      await nav.getByRole("button", { name: "Members" }).click();

      const memberSearch = dialog.getByRole("combobox", {
        name: "Search members by @username or name",
      });

      await expect(memberSearch).toBeVisible();
      await expect(dialog.getByRole("list", { name: "Members" })).toBeVisible();

      await memberSearch.fill("@");
      await expect(dialog.getByRole("listbox")).toBeVisible();

      expect((await makeAxeBuilder().analyze()).violations).toEqual([]);

      await memberSearch.clear();

      await nav.getByRole("button", { name: "Invites" }).click();
      await expect(
        dialog
          .getByText("No open invites")
          .or(dialog.getByRole("list", { name: "Invites" })),
      ).toBeVisible();

      await nav.getByRole("button", { name: "Bans" }).click();
      await expect(
        dialog
          .getByText("This server has no banned users")
          .or(dialog.getByRole("list", { name: "Bans" })),
      ).toBeVisible();

      expect((await makeAxeBuilder().analyze()).violations).toEqual([]);

      await nav.getByRole("button", { name: "Audit log" }).click();
      await expect(
        dialog.getByRole("heading", { name: "Audit log", level: 2 }),
      ).toBeVisible();

      await dialog.getByRole("button", { name: /^Action/ }).click();
      await expect(
        dialog.page().getByRole("menuitemcheckbox", { name: "Member banned" }),
      ).toBeVisible();

      expect((await makeAxeBuilder().analyze()).violations).toEqual([]);
    });
  }
});

test.describe("channel permissions", { tag: "@a11y" }, () => {
  for (const theme of THEMES) {
    test(`has no WCAG 2.2 A or AA violations in the ${theme} theme`, async ({
      page,
      makeAxeBuilder,
      enterDemo,
    }) => {
      await enterDemo(theme);

      const general = page.getByRole("link", { name: /general/ }).first();

      await general.click();

      // Channel settings opens the *active* channel, so the click has to have
      // landed first. The demo opens on a different channel, which is what
      // makes the wait load-bearing rather than decorative.
      await expect(general).toHaveAttribute("aria-current", "page");

      await page.getByRole("button", { name: "Channel settings" }).click();

      const channel = page.getByRole("dialog", { name: "#general" });

      await expect(channel).toBeVisible();
      await channel.getByRole("tab", { name: "Permissions" }).click();

      await expect(
        channel.getByRole("radiogroup", { name: "View channel" }),
      ).toBeVisible();

      expect((await makeAxeBuilder().analyze()).violations).toEqual([]);
    });
  }
});
