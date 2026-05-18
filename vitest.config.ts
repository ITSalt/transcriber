import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run tests from all packages
    projects: [
      "shared/vitest.config.ts",
      "api/vitest.config.ts",
      "worker/vitest.config.ts",
      "web/vitest.config.ts",
    ],
  },
});
