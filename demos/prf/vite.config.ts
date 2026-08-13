import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: {
    outDir: "../../docs/public/prf-demo",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
  },
});
