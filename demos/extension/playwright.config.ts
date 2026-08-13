import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 30_000,
  fullyParallel: true,
  use: { trace: "retain-on-failure" },
});
