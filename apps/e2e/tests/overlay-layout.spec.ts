import { expect, test } from "./fixtures/index.js";

const SAMPLE_MS = 3000;
const WHEEL_TICKS = 20;

test("an open tooltip never grows the document while the history scrolls", async ({
  page,
  enterDemo,
}) => {
  await enterDemo("light");

  const members = page.getByRole("complementary", { name: "Members" });
  const scroller = page.getByTestId("virtuoso-scroller");
  const tip = page.locator('[data-slot="tooltip-content"]');

  await expect(members).toBeVisible();

  const target = await page.evaluate(() => {
    const box = [...document.querySelectorAll("button")]
      .filter((button) => button.getAttribute("aria-label") === "Reply")
      .map((button) => button.getBoundingClientRect())
      .find((rect) => rect.top > 200 && rect.bottom < window.innerHeight - 200);

    return box === undefined
      ? null
      : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  });

  expect(
    target,
    "the history needs a Reply button inside the window",
  ).not.toBeNull();

  await page.mouse.move(target?.x ?? 0, target?.y ?? 0);

  await expect(tip).toBeVisible();

  const before = await scroller.evaluate((element) => element.scrollTop);

  const sampled = page.evaluate(async (windowMs: number) => {
    const panel = document.querySelector(
      "aside[aria-labelledby=member-panel-heading]",
    );
    const root = document.documentElement;

    if (panel === null) {
      throw new Error("the member panel is not rendered");
    }

    const frames: { overflowed: boolean; x: number }[] = [];
    const deadline = performance.now() + windowMs;

    while (performance.now() < deadline) {
      await new Promise(requestAnimationFrame);

      frames.push({
        overflowed: root.scrollHeight > root.clientHeight,
        x: panel.getBoundingClientRect().x,
      });
    }

    return frames;
  }, SAMPLE_MS);

  for (let tick = 0; tick < WHEEL_TICKS; tick += 1) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(80);
  }

  const frames = await sampled;

  expect(frames.length).toBeGreaterThan(30);
  expect(
    await scroller.evaluate((element) => element.scrollTop),
    "the wheel has to have actually moved the history",
  ).toBeLessThan(before);

  expect(frames.filter((frame) => frame.overflowed)).toEqual([]);
  expect([...new Set(frames.map((frame) => frame.x))]).toHaveLength(1);
});
