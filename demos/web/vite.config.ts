import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The library is consumed from its built output so Vite never has to resolve the
// package's `.js` import specifiers back to `.ts` source. Build it once at the repo
// root (`npm run build`) before running the demo.
const libEntry = fileURLToPath(
  new URL("../../library/dist/index.js", import.meta.url),
);
const libViemEntry = fileURLToPath(
  new URL("../../library/dist/viem.js", import.meta.url),
);
const mainEntry = fileURLToPath(new URL("./index.html", import.meta.url));
const passkeyEntry = fileURLToPath(new URL("./passkey.html", import.meta.url));

export default defineConfig({
  // The documentation website serves this build at /demo/ on its own origin, so
  // passkey creation runs same-origin: WebKit refuses it in a cross-origin frame.
  // A relative base keeps asset URLs correct under that subpath, and emptying an
  // out directory outside the Vite root takes an explicit opt-in.
  base: "./",
  build: {
    outDir: "../../docs/public/demo",
    emptyOutDir: true,
    rollupOptions: { input: [mainEntry, passkeyEntry] },
  },
  plugins: [react()],
  resolve: {
    alias: {
      // The subpath key must come before the bare package name: Vite string
      // aliases prefix-match, so the shorter key would otherwise claim it.
      "@category-labs/mera/viem": libViemEntry,
      "@category-labs/mera": libEntry,
    },
    // The library's dist/viem.js imports viem while the demo imports
    // its own copy; dedupe resolves both to the demo's copy so the bundle
    // carries one viem.
    dedupe: ["viem"],
  },
  server: {
    // Allow the built library and hoisted dependencies at the repository root.
    fs: { allow: ["../.."] },
  },
});
