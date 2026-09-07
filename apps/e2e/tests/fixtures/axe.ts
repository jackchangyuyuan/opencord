import { AxeBuilder } from "@axe-core/playwright";
import { type Page, test as base } from "@playwright/test";

const WCAG_22_AA_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
];

export type Theme = "dark" | "light";

const PREFS_STORAGE_KEY = "opencord:prefs";

async function useTheme(page: Page, theme: Theme): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem(
        key ?? "",
        JSON.stringify({ state: { theme: value, compact: false }, version: 0 }),
      );
    },
    [PREFS_STORAGE_KEY, theme],
  );
}

async function enterDemo(page: Page, theme: Theme): Promise<void> {
  await useTheme(page, theme);

  await page.goto("/");
  await page.getByRole("button", { name: "Enter demo — no signup" }).click();
  await page.getByRole("textbox", { name: "Message" }).waitFor();
  await page.getByTestId("message-content").first().waitFor();
}

interface AxeFixtures {
  makeAxeBuilder: () => AxeBuilder;
  useTheme: (theme: Theme) => Promise<void>;
  enterDemo: (theme: Theme) => Promise<void>;
}

export const test = base.extend<AxeFixtures>({
  makeAxeBuilder: async ({ page }, use) => {
    await use(() => new AxeBuilder({ page }).withTags(WCAG_22_AA_TAGS));
  },
  useTheme: async ({ page }, use) => {
    await use((theme) => useTheme(page, theme));
  },
  enterDemo: async ({ page }, use) => {
    await use((theme) => enterDemo(page, theme));
  },
});

export const THEMES: Theme[] = ["light", "dark"];
