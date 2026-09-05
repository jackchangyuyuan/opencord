import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:5173";
const usesExternalStack = Boolean(process.env["E2E_BASE_URL"]);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env["CI"]),
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(usesExternalStack
    ? {}
    : {
        webServer: [
          {
            name: "api",
            command: "pnpm --filter @opencord/api dev",
            cwd: "../..",
            env: {
              RATE_LIMIT_AUTH_POINTS: "1000",
              RATE_LIMIT_CLAIM_POINTS: "1000",
              RATE_LIMIT_DEMO_DAILY_POINTS: "10000",
              RATE_LIMIT_DEMO_POINTS: "1000",
              RATE_LIMIT_MESSAGE_POINTS: "1000",
            },
            url: "http://127.0.0.1:3000/readyz",
            reuseExistingServer: !process.env["CI"],
            stdout: "ignore",
            stderr: "pipe",
          },
          {
            name: "web",
            command: "pnpm --filter @opencord/web dev",
            cwd: "../..",
            url: "http://localhost:5173",
            reuseExistingServer: !process.env["CI"],
            stdout: "ignore",
            stderr: "pipe",
          },
        ],
      }),
});
