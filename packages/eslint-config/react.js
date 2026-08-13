import eslintReact from "@eslint-react/eslint-plugin";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export const reactConfig = defineConfig([
  {
    name: "opencord/react",
    extends: [
      eslintReact.configs["recommended-type-checked"],
      reactHooks.configs.flat.recommended,
      eslintReact.configs["disable-conflict-eslint-plugin-react-hooks"],
      reactRefresh.configs.vite,
    ],
  },
]);
