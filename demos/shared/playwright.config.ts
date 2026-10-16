import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const vueUrl = "http://localhost:4174";

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "unit", testMatch: ["market.spec.ts", "position.spec.ts"] },
    { name: "vue", testMatch: "trading.spec.ts", use: { baseURL: vueUrl } },
  ],
  webServer: {
    command:
      "npm run dev -w demos/vue -- --host localhost --port 4174 --strictPort",
    cwd: repositoryRoot,
    url: vueUrl,
  },
});
