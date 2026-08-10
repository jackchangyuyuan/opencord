import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import simpleImportSort from "eslint-plugin-simple-import-sort";

export const baseConfig = defineConfig([
  globalIgnores(["dist/"]),

  {
    name: "opencord/imports",
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/exports": "error",
      "simple-import-sort/imports": "error",
    },
  },

  {
    name: "opencord/javascript",
    files: ["**/*.js"],
    extends: [js.configs.recommended],
  },

  prettier,
]);
