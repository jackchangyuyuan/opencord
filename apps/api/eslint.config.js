import { baseConfig } from "@opencord/eslint-config/base";
import { nodeConfig } from "@opencord/eslint-config/node";
import { defineConfig } from "eslint/config";

export default defineConfig([baseConfig, nodeConfig]);
