import { defineConfig, devices } from "@playwright/test";

const desktopChrome = devices["Desktop Chrome"];

// Tests import built dist/ output, including internals via deep paths like
// ../dist/session.js, so they exercise the shipped artifact and the browser e2e
// page can load the same JS. Run via `npm test`, which rebuilds first; bare
// `playwright test` can run against stale dist/.
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
