import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      AWS_ACCESS_KEY_ID: "opencord-dev",
      AWS_REGION: "us-east-1",
      AWS_SECRET_ACCESS_KEY: "opencord-dev-secret",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
      DATABASE_URL: "postgres://localhost:5432/opencord_test",
      PUBLIC_ORIGIN: "http://localhost:5173",
      RATE_LIMIT_AUTH_POINTS: "1000000",
      RATE_LIMIT_CREATE_POINTS: "1000000",
      RATE_LIMIT_HEARTBEAT_POINTS: "1000000",
      RATE_LIMIT_MESSAGE_POINTS: "1000000",
      RATE_LIMIT_TYPING_POINTS: "1000000",
      REDIS_URL: "redis://localhost:6379",
      S3_BUCKET: "opencord-dev-uploads",
      S3_ENDPOINT: "http://localhost:9000",
      S3_FORCE_PATH_STYLE: "true",
      STORAGE_PUBLIC_ORIGIN: "http://localhost:9000",
    },
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**"],
      exclude: ["src/**/*.test.ts", "src/db/migrations/**"],
      thresholds: {
        "src/modules/**": {
          statements: 85,
          branches: 85,
          functions: 85,
          lines: 85,
        },
      },
    },
  },
});
