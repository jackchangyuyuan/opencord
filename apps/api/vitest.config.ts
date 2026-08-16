import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
      DATABASE_URL: "postgres://localhost:5432/opencord_test",
      PUBLIC_ORIGIN: "http://localhost:5173",
    },
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**"],
      exclude: ["src/**/*.test.ts", "src/db/migrations/**"],
    },
  },
});
