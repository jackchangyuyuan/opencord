import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import turbo from "eslint-plugin-turbo";
import tseslint from "typescript-eslint";

export const baseConfig = defineConfig([
  globalIgnores(["dist/", ".turbo/"]),

  {
    name: "opencord/imports",
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/exports": "error",
      "simple-import-sort/imports": "error",
    },
  },

  {
    name: "opencord/turbo",
    plugins: { turbo },
    rules: { "turbo/no-undeclared-env-vars": "error" },
  },

  {
    name: "opencord/javascript",
    files: ["**/*.js"],
    extends: [js.configs.recommended],
  },

  {
    name: "opencord/typescript",
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: { parserOptions: { projectService: true } },
  },

  prettier,
]);
