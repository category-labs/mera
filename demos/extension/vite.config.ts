import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const libEntry = fileURLToPath(
  new URL("../../library/dist/index.js", import.meta.url),
);
const libViemEntry = fileURLToPath(
  new URL("../../library/dist/viem.js", import.meta.url),
);
const sidePanelEntry = fileURLToPath(
  new URL("./sidepanel.html", import.meta.url),
);

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: { input: sidePanelEntry },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@category-labs/mera/viem": libViemEntry,
      "@category-labs/mera": libEntry,
    },
    dedupe: ["viem"],
  },
});
