/// <reference path="./eslint-plugin-drizzle.d.ts" />
import { defineConfig } from "eslint/config";
import drizzle from "eslint-plugin-drizzle";

export const drizzleConfig = defineConfig([
  {
    name: "opencord/drizzle",
    plugins: { drizzle },
    rules: {
      "drizzle/enforce-delete-with-where": [
        "error",
        { drizzleObjectName: ["db", "tx"] },
      ],
      "drizzle/enforce-update-with-where": [
        "error",
        { drizzleObjectName: ["db", "tx"] },
      ],
    },
  },
]);
