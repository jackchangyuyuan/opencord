import vitest from "@vitest/eslint-plugin";
import { defineConfig } from "eslint/config";

export const vitestConfig = defineConfig([
  { name: "opencord/vitest", extends: [vitest.configs.recommended] },
]);
