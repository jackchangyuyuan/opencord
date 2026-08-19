import { baseConfig } from "@opencord/eslint-config/base";
import { nodeConfig } from "@opencord/eslint-config/node";
import { playwrightConfig } from "@opencord/eslint-config/playwright";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["test-results/", "playwright-report/", "blob-report/"]),
  baseConfig,
  nodeConfig,
  { files: ["tests/**"], extends: [playwrightConfig] },
]);
