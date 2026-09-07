import { randomUUID } from "node:crypto";

import { expect, test } from "../fixtures/index.js";

const ANNOUNCER = '[data-slot="message-announcer"]';

test.describe("the live region", { tag: "@a11y" }, () => {
  test("announces a message that arrives over the socket", async ({
    page,
    request,
    enterDemo,
  }) => {
    await enterDemo("light");

    const announcer = page.locator(ANNOUNCER);

    await expect(announcer).toHaveAttribute("aria-live", "polite");
    await expect(page.locator(`main ${ANNOUNCER}`)).toHaveCount(1);

    await page.evaluate((selector) => {
      const node = document.querySelector(selector);

      if (node === null) {
        throw new Error("the announcer is missing");
      }

      const seen: string[] = [];

      (window as unknown as { announced: string[] }).announced = seen;

      new MutationObserver(() => {
        seen.push(node.textContent.trim());
      }).observe(node, {
        characterData: true,
        childList: true,
        subtree: true,
      });
    }, ANNOUNCER);

    const channelId = new URL(page.url()).pathname.split("/").pop() ?? "";
    const body = `announced ${randomUUID().slice(0, 8)}`;

    expect((await request.post("/api/v1/demo/guest")).status()).toBe(201);
    expect(
      (
        await request.post(`/api/v1/channels/${channelId}/messages`, {
          data: { content: body, nonce: randomUUID() },
        })
      ).status(),
    ).toBe(201);

    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { announced: string[] }).announced,
          ),
        { timeout: 15_000 },
      )
      .toContain(body);
  });
});
