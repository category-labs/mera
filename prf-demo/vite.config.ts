import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const libEntry = fileURLToPath(new URL("../dist/index.js", import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    outDir: "../docs/public/prf-demo",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@category-labs/mera": libEntry,
    },
  },
  server: {
    fs: { allow: [".."] },
  },
  test: {
    environment: "node",
  },
});
