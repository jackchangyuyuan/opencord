import { defineConfig } from "eslint/config";
import globals from "globals";

export const nodeConfig = defineConfig([
  {
    name: "opencord/node",
    languageOptions: { globals: globals.node },
  },
]);
