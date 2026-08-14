import { baseConfig } from "@opencord/eslint-config/base";
import { browserConfig } from "@opencord/eslint-config/browser";
import { nodeConfig } from "@opencord/eslint-config/node";
import { reactConfig } from "@opencord/eslint-config/react";
import { testingLibraryConfig } from "@opencord/eslint-config/testing-library";
import { vitestConfig } from "@opencord/eslint-config/vitest";
import { defineConfig } from "eslint/config";

export default defineConfig([
  baseConfig,

  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [browserConfig, reactConfig],
    rules: { "no-console": "error" },
  },

  {
    files: ["src/**/*.test.{ts,tsx}"],
    extends: [vitestConfig],
    rules: { "no-console": "off" },
  },

  {
    files: ["src/**/*.test.tsx"],
    extends: [testingLibraryConfig],
  },

  {
    files: ["*.config.ts", "eslint.config.js"],
    extends: [nodeConfig],
  },
]);
