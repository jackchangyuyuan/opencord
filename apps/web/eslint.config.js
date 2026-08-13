import { baseConfig } from "@opencord/eslint-config/base";
import { browserConfig } from "@opencord/eslint-config/browser";
import { nodeConfig } from "@opencord/eslint-config/node";
import { reactConfig } from "@opencord/eslint-config/react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  baseConfig,

  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [browserConfig, reactConfig],
    rules: { "no-console": "error" },
  },

  {
    files: ["*.config.ts", "eslint.config.js"],
    extends: [nodeConfig],
  },
]);
