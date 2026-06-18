import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// The library is consumed from its built output so Vite never has to resolve the
// package's `.js` import specifiers back to `.ts` source. Build it once at the repo
// root (`npm run build`) before running the demo.
const libEntry = fileURLToPath(new URL("../dist/index.js", import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    // `@solana/web3.js` and our own Solana adapter rely on Buffer in the browser.
    // The polyfill bundles the npm `buffer` package and exposes it globally.
    nodePolyfills({ include: ["buffer"], globals: { Buffer: true } }),
  ],
  resolve: {
    alias: {
      mera: libEntry,
    },
  },
  server: {
    // Allow reading ../dist and resolving the library's @noble/* deps from the repo root.
    fs: { allow: [".."] },
  },
});
