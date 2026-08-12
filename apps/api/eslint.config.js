import { baseConfig } from "@opencord/eslint-config/base";
import { nodeConfig } from "@opencord/eslint-config/node";
import { vitestConfig } from "@opencord/eslint-config/vitest";
import { defineConfig } from "eslint/config";

export default defineConfig([
  baseConfig,
  nodeConfig,

  {
    files: ["src/**/*.test.ts", "tests/**"],
    extends: [vitestConfig],
  },
]);
