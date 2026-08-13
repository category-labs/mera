import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
});
