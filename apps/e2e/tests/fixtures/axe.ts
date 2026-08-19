import { AxeBuilder } from "@axe-core/playwright";
import { test as base } from "@playwright/test";

const WCAG_22_AA_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
];

interface AxeFixtures {
  makeAxeBuilder: () => AxeBuilder;
}

export const test = base.extend<AxeFixtures>({
  makeAxeBuilder: async ({ page }, use) => {
    await use(() => new AxeBuilder({ page }).withTags(WCAG_22_AA_TAGS));
  },
});
