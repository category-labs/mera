import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const webUrl = "http://localhost:4173";

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  use: { baseURL: webUrl, trace: "retain-on-failure" },
  webServer: {
    command:
      "npm run dev -w demos/web -- --host localhost --port 4173 --strictPort",
    cwd: repositoryRoot,
    url: webUrl,
  },
});
