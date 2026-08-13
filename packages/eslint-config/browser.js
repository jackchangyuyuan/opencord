import { defineConfig } from "eslint/config";
import globals from "globals";

export const browserConfig = defineConfig([
  {
    name: "opencord/browser",
    languageOptions: { globals: globals.browser },
  },
]);
