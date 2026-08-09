import { defineConfig } from "eslint/config";

import { baseConfig } from "./base.js";
import { nodeConfig } from "./node.js";

export default defineConfig([baseConfig, nodeConfig]);
