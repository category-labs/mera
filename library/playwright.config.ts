import { defineConfig, devices } from "@playwright/test";

// Tests import built dist/ output, including internals via deep paths like
// ../dist/session.js, so they exercise the shipped artifact and the browser e2e
// page can load the same JS. Run via `npm test`, which rebuilds first; bare
// `playwright test` can run against stale dist/.
export default defineConfig({
  testDir: "./test",
  fullyParallel: true,
  use: devices["Desktop Chrome"],
  projects: [
    { name: "chromium", testMatch: /.*\.test\.ts/ },
    { name: "chromium-e2e", testMatch: /.*\.e2e\.ts/ },
  ],
});
