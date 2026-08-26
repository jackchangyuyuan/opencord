import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.js";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      env: { TZ: "Asia/Tokyo" },
      environment: "jsdom",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      setupFiles: ["./src/test-setup.ts"],
      coverage: {
        provider: "v8",
        reporter: ["text", "html"],
        include: ["src/**"],
        exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/main.tsx"],
      },
    },
  }),
);
