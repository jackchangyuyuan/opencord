import { baseConfig } from "@opencord/eslint-config/base";
import { nodeConfig } from "@opencord/eslint-config/node";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["apps/", "packages/"]),
  baseConfig,
  nodeConfig,
]);
