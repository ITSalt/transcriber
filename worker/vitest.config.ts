import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "worker",
    include: ["src/**/*.{test,spec}.ts", "test/**/*.{test,spec}.ts"],
  },
});
