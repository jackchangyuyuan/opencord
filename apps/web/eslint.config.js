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
    files: ["public/**/*.js"],
    extends: [browserConfig],
  },

  {
    files: ["src/components/ui/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
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
    files: ["src/main.tsx"],
    rules: {
      "turbo/no-undeclared-env-vars": ["error", { allowList: ["^PROD$"] }],
    },
  },

  {
    files: ["*.config.ts", "eslint.config.js"],
    extends: [nodeConfig],
  },

  {
    files: ["vitest.config.ts"],
    rules: {
      "turbo/no-undeclared-env-vars": ["error", { allowList: ["^TZ$"] }],
    },
  },
]);
