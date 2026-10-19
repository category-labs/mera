import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Files the published tarball must hold besides the `exports` targets, which
// `publint --strict` checks after this script in `npm run check:pack`: the
// entry-point sources the shipped maps reference, the README, and both
// license files.
const REQUIRED_FILES = [
  "src/index.ts",
  "src/react-native-webauthn-client.ts",
  "src/viem.ts",
  "src/wagmi.ts",
  "README.md",
  "LICENSE-MIT",
  "LICENSE-APACHE",
];

for (const license of ["LICENSE-MIT", "LICENSE-APACHE"]) {
  const packageLicense = readFileSync(
    new URL(`../${license}`, import.meta.url),
    "utf8",
  );
  const repositoryLicense = readFileSync(
    new URL(`../../${license}`, import.meta.url),
    "utf8",
  );
  if (packageLicense !== repositoryLicense) {
    console.error(`${license} differs from the repository copy`);
    process.exit(1);
  }
}

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
// by package name. Either way, the first value is this package's report.
const [report] = Object.values(JSON.parse(packOutput));
const shipped = new Set(report.files.map((entry) => entry.path));

const missing = REQUIRED_FILES.filter((path) => !shipped.has(path));
if (missing.length > 0) {
  console.error(`Tarball is missing required files: ${missing.join(", ")}`);
  process.exit(1);
}

const packageRootFiles = new Set([
  "package.json",
  "README.md",
  "LICENSE-MIT",
  "LICENSE-APACHE",
]);
const unexpected = [...shipped].filter(
  (path) =>
    !packageRootFiles.has(path) &&
    !path.startsWith("dist/") &&
    !path.startsWith("src/"),
);
if (unexpected.length > 0) {
  console.error(`Tarball contains unexpected files: ${unexpected.join(", ")}`);
  process.exit(1);
}

console.log(
  `Tarball OK (${shipped.size} files); verified ${REQUIRED_FILES.join(", ")}`,
);
