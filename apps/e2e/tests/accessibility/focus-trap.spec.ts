import type { Locator, Page } from "@playwright/test";

import { expect, test } from "../fixtures/index.js";

function settle(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

function expectFocusInside(page: Page, selector: string): Promise<void> {
  return expect.poll(() => activeInside(page, selector)).toBe(true);
}

function activeInside(page: Page, selector: string): Promise<boolean> {
  return page.evaluate(
    (target) => document.activeElement?.closest(target) != null,
    selector,
  );
}

async function escapees(page: Page, selector: string): Promise<string[]> {
  const escaped: string[] = [];

  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");

    if (!(await activeInside(page, selector))) {
      await settle(page);
    }

    if (!(await activeInside(page, selector))) {
      escaped.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;

          return `${el?.tagName ?? "none"}[${
            el?.getAttribute("aria-label") ??
            (el?.textContent ?? "").trim().slice(0, 20)
          }]`;
        }),
      );
    }
  }

  return escaped;
}

async function arrowEscapees(page: Page, selector: string): Promise<string[]> {
  const escaped: string[] = [];

  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("ArrowDown");

    if (!(await activeInside(page, selector))) {
      escaped.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;

          return `${el?.tagName ?? "none"}[${
            el?.getAttribute("aria-label") ??
            (el?.textContent ?? "").trim().slice(0, 20)
          }]`;
        }),
      );
    }
  }

  return escaped;
}

async function closesBackToTrigger(
  page: Page,
  trigger: Locator,
  overlay: Locator,
): Promise<void> {
  await page.keyboard.press("Escape");

  await expect(overlay).toBeHidden();
  await expect(trigger).toBeFocused();
}

test.describe("overlay focus trapping", { tag: "@a11y" }, () => {
  test("traps a modal dialog and releases it to its trigger", async ({
    page,
    enterDemo,
  }) => {
    await enterDemo("light");

    const trigger = page.getByRole("button", { name: "Your profile" });

    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Your profile" });

    await expect(dialog).toBeVisible();
    await expectFocusInside(page, '[role="dialog"]');
    expect(await escapees(page, '[role="dialog"]')).toEqual([]);

    await closesBackToTrigger(page, trigger, dialog);
  });

  test("moves focus into a popover and releases it to its trigger", async ({
    page,
    enterDemo,
  }) => {
    await enterDemo("light");

    const trigger = page.getByRole("button", { name: "Pinned messages" });

    await trigger.click();

    const popover = page.locator('[data-slot="popover-content"]');

    await expect(popover).toBeVisible();
    await expectFocusInside(page, '[data-slot="popover-content"]');

    await closesBackToTrigger(page, trigger, popover);
  });

  test("traps a dropdown menu and releases it to its trigger", async ({
    page,
    enterDemo,
  }) => {
    await enterDemo("light");

    await page
      .getByRole("navigation", { name: "Servers and channels" })
      .getByRole("button", { name: /^Your sandbox/ })
      .click();

    const trigger = page
      .getByRole("complementary", { name: "Members" })
      .getByRole("button", { name: /^Member actions for / })
      .first();

    await expect(trigger).toBeEnabled({ timeout: 15_000 });
    await trigger.click();

    const menu = page.getByRole("menu");

    await expect(menu).toBeVisible();
    await expectFocusInside(page, '[role="menu"]');
    expect(await arrowEscapees(page, '[role="menu"]')).toEqual([]);

    await closesBackToTrigger(page, trigger, menu);
  });

  test("traps a context menu and closes it on Escape", async ({
    page,
    enterDemo,
  }) => {
    await enterDemo("light");

    await page.locator("[data-message-row]").first().click({ button: "right" });

    const menu = page.getByRole("menu");

    await expect(menu).toBeVisible();
    await expectFocusInside(page, '[role="menu"]');
    expect(await arrowEscapees(page, '[role="menu"]')).toEqual([]);

    await page.keyboard.press("Escape");

    await expect(menu).toBeHidden();
  });

  test("shows a tooltip to the keyboard without taking focus", async ({
    page,
    enterDemo,
  }) => {
    await enterDemo("light");

    await page.getByRole("link", { name: "Direct messages" }).focus();
    await page.keyboard.press("Tab");

    const trigger = page
      .getByRole("navigation", { name: "Servers and channels" })
      .getByRole("button", { name: /^OpenCord HQ/ });

    await expect(trigger).toBeFocused();

    const tip = page.locator('[data-slot="tooltip-content"]');

    await expect(tip).toBeVisible();
    await expect(trigger).toBeFocused();

    await page.keyboard.press("Escape");

    await expect(tip).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("never cycles inside a subtree once every overlay is closed", async ({
    page,
    enterDemo,
  }) => {
    await enterDemo("light");

    const seen = new Set<string>();

    for (let index = 0; index < 50; index += 1) {
      await page.keyboard.press("Tab");

      seen.add(
        await page.evaluate((step) => {
          const el = document.activeElement as HTMLElement | null;

          if (el === null || el === document.body) {
            return "body";
          }

          el.setAttribute("data-focus-step", String(step));

          return el.getAttribute("data-focus-step") ?? "";
        }, index),
      );
    }

    expect(seen.size).toBe(50);

    expect(
      await page.evaluate(
        () =>
          document.querySelector("aside")?.contains(document.activeElement) ===
          true,
      ),
    ).toBe(true);
  });
});
