import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { DATABASE_URL: "postgres://localhost:5432/opencord_test" },
    environment: "node",
    include: ["src/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**"],
      exclude: ["src/**/*.test.ts", "src/db/migrations/**"],
    },
  },
});
