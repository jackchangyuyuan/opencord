import { baseConfig } from "@opencord/eslint-config/base";
import { drizzleConfig } from "@opencord/eslint-config/drizzle";
import { nodeConfig } from "@opencord/eslint-config/node";
import { vitestConfig } from "@opencord/eslint-config/vitest";
import { defineConfig } from "eslint/config";

export default defineConfig([
  baseConfig,
  nodeConfig,

  {
    files: ["src/**/*.ts"],
    extends: [drizzleConfig],
    rules: { "no-console": "error" },
  },

  {
    files: ["src/**/*.test.ts", "tests/**"],
    extends: [vitestConfig],
    rules: { "no-console": "off" },
  },

  {
    files: ["drizzle.config.ts"],
    rules: {
      "turbo/no-undeclared-env-vars": [
        "error",
        { allowList: ["^DATABASE_URL$"] },
      ],
    },
  },

  {
    files: [
      "tests/integration/rate-limit*.test.ts",
      "tests/integration/socket-typing.test.ts",
    ],
    rules: {
      "turbo/no-undeclared-env-vars": [
        "error",
        { allowList: ["^RATE_LIMIT_", "^TRUST_PROXY_HOPS$"] },
      ],
    },
  },

  {
    files: [
      "src/lib/leader-election.test.ts",
      "tests/integration/jobs.test.ts",
    ],
    rules: {
      "turbo/no-undeclared-env-vars": [
        "error",
        { allowList: ["^JOB_LOCK_NAMESPACE$"] },
      ],
    },
  },

  {
    files: ["tests/setup.ts"],
    rules: {
      "turbo/no-undeclared-env-vars": [
        "error",
        { allowList: ["^DATABASE_URL$", "^VITEST_POOL_ID$"] },
      ],
    },
  },
]);
