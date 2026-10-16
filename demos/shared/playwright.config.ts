import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
// The demo workspaces the trading spec runs against, each on its own port.
const demos = [
  { name: "vue", port: 4174 },
  { name: "web", port: 4173 },
];

export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "unit", testMatch: ["market.spec.ts", "position.spec.ts"] },
    ...demos.map(({ name, port }) => ({
      name,
      testMatch: "trading.spec.ts",
      use: { baseURL: `http://localhost:${port}` },
    })),
  ],
  webServer: demos.map(({ name, port }) => ({
    command: `npm run dev -w demos/${name} -- --host localhost --port ${port} --strictPort`,
    cwd: repositoryRoot,
    url: `http://localhost:${port}`,
  })),
});
