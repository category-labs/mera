import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The library is consumed from its built output so Vite never has to resolve the
// package's `.js` import specifiers back to `.ts` source. Build it once at the repo
// root (`npm run build`) before running the demo.
const libEntry = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const libViemEntry = fileURLToPath(new URL("../dist/viem.js", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The subpath key must come before the bare package name: Vite string
      // aliases prefix-match, so the shorter key would otherwise claim it.
      "@category-labs/mera/viem": libViemEntry,
      "@category-labs/mera": libEntry,
    },
    // ../dist/viem.js imports viem from the repo root while the demo imports
    // its own copy; dedupe resolves both to the demo's copy so the bundle
    // carries one viem.
    dedupe: ["viem"],
  },
  server: {
    // Allow reading ../dist and resolving the library's @noble/* deps from the repo root.
    fs: { allow: [".."] },
  },
});
