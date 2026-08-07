import { execFileSync } from "node:child_process";

// Files a consumer must find in the published tarball: the entry points that
// `exports` resolves to, the sources the shipped maps reference, and both
// license files. `dist/` is gitignored and built at pack time (the `prepack`
// script), so this guards against a broken `files`/`exports`/build shipping a
// stale, incomplete, or empty package. Run via `npm run check:pack` and CI.
const REQUIRED_FILES = [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/react-native-passkey-client.js",
  "dist/react-native-passkey-client.d.ts",
  "dist/react-native-passkey.js",
  "dist/react-native-passkey.d.ts",
  "dist/viem.js",
  "dist/viem.d.ts",
  "src/index.ts",
  "src/react-native-passkey-client.ts",
  "src/react-native-passkey.ts",
  "src/viem.ts",
  "README.md",
  "LICENSE-MIT",
  "LICENSE-APACHE",
];

// `npm pack --dry-run --json` reports the exact tarball file list without
// writing a .tgz to disk. `--ignore-scripts` skips the `prepack` rebuild so
// this inspects the dist `check:pack` already built rather than building a
// second time.
const packOutput = execFileSync(
  "npm",
  ["pack", "--dry-run", "--json", "--ignore-scripts"],
  { encoding: "utf8" },
);
// npm <= 11 prints an array of pack reports; npm 12 prints an object keyed
// by package name. Both hold a single report for this package.
const parsed = JSON.parse(packOutput);
const report = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
const shipped = new Set(report.files.map((entry) => entry.path));

const missing = REQUIRED_FILES.filter((path) => !shipped.has(path));
if (missing.length > 0) {
  console.error(`Tarball is missing required files: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(
  `Tarball OK (${shipped.size} files); verified ${REQUIRED_FILES.join(", ")}`,
);
