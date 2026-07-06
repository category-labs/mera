import { defineConfig, devices } from "@playwright/test";

const desktopChrome = devices["Desktop Chrome"];

export default defineConfig({
  testDir: "./test",
  fullyParallel: true,
  projects: [
    {
      name: "chromium",
      testMatch: /.*\.test\.ts/,
      use: {
        ...desktopChrome,
      },
    },
    {
      name: "chromium-e2e",
      testMatch: /.*\.e2e\.ts/,
      use: {
        ...desktopChrome,
      },
    },
  ],
});
