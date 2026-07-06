import { execFileSync } from "node:child_process";

// Files a consumer must find in the published tarball: the entry points that
// `exports` resolves to, the sources the shipped maps reference, and both
// license files. `dist/` is gitignored and built at pack time (the `prepack`
// script), so this guards against a broken `files`/`exports`/build shipping a
// stale, incomplete, or empty package. Run via `npm run check:pack` and CI.
const REQUIRED_FILES = [
  "dist/index.js",
  "dist/index.d.ts",
  "src/index.ts",
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
const shipped = new Set(
  JSON.parse(packOutput)[0].files.map((entry) => entry.path),
);

const missing = REQUIRED_FILES.filter((path) => !shipped.has(path));
if (missing.length > 0) {
  console.error(`Tarball is missing required files: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(
  `Tarball OK (${shipped.size} files); verified ${REQUIRED_FILES.join(", ")}`,
);
