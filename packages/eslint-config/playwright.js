import { defineConfig } from "eslint/config";
import playwright from "eslint-plugin-playwright";

export const playwrightConfig = defineConfig([
  {
    name: "opencord/playwright",
    extends: [playwright.configs["flat/recommended"]],
  },
]);
