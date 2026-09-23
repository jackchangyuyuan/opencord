import type { Page } from "@playwright/test";

import { expect, test } from "../fixtures/index.js";

interface Stop {
  region: string;
  name: string;
  indicator: boolean;
}

const ORDER = ["rail", "sidebar", "main", "aside"];

function describeStop(page: Page): Promise<Stop> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;

    if (el === null || el === document.body) {
      return { region: "none", name: "", indicator: false };
    }

    const nav = document.querySelector(
      'nav[aria-label="Servers and channels"]',
    );
    const sections = nav === null ? [] : [...nav.children];
    const style = getComputedStyle(el);

    const inside = (node: Element | undefined | null) =>
      node?.contains(el) === true;

    const region = inside(sections[0])
      ? "rail"
      : inside(sections[1])
        ? "sidebar"
        : inside(document.querySelector("main"))
          ? "main"
          : inside(document.querySelector("aside"))
            ? "aside"
            : inside(document.querySelector("header"))
              ? "header"
              : "other";

    return {
      region,
      name: el.getAttribute("aria-label") ?? el.textContent.trim().slice(0, 40),
      indicator: style.outlineStyle !== "none" || style.boxShadow !== "none",
    };
  });
}

test.describe("keyboard focus order", { tag: "@a11y" }, () => {
  test("runs rail to sidebar to message list to composer, each with a ring", async ({
    page,
    enterDemo,
  }) => {
    await enterDemo("light");

    await expect(
      page.locator('nav[aria-label="Servers and channels"] > *'),
    ).toHaveCount(2);

    const stops: Stop[] = [];

    for (let index = 0; index < 40; index += 1) {
      await page.keyboard.press("Tab");
      stops.push(await describeStop(page));
    }

    const [first] = stops;

    expect(first?.name).toBe("Skip to the conversation");
    expect(stops.filter((stop) => !stop.indicator)).toEqual([]);

    const visited = stops
      .map((stop) => stop.region)
      .filter((region) => ORDER.includes(region));

    const firstVisit = ORDER.map((region) => visited.indexOf(region));

    expect(firstVisit).not.toContain(-1);
    expect(firstVisit).toEqual([...firstVisit].sort((a, b) => a - b));

    const listAt = stops.findIndex((stop) => stop.name === "Message history");

    expect(listAt).toBeGreaterThan(-1);
    // The composer follows the history. A link or a jump pill in the newest
    // messages is focusable too, so the composer is not always the very next
    // stop -- the order is what matters, not the distance.
    expect(
      stops.slice(listAt + 1, listAt + 7).map((stop) => stop.name),
    ).toContain("Message");
  });

  test("moves focus into the conversation when the skip link is taken", async ({
    page,
    enterDemo,
  }) => {
    await enterDemo("light");

    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Skip to the conversation" }),
    ).toBeFocused();

    await page.keyboard.press("Enter");

    await expect(page.locator("main")).toBeFocused();
  });
});
