// @ts-check

import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTwoslasher } from "@ec-ts/twoslash";
import ts from "typescript";

const docsDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const contentDirectory = join(docsDirectory, "src/content/docs");
const tsConfigPath = join(docsDirectory, "tsconfig.twoslash.json");

const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
if (configFile.error !== undefined) {
  throw new Error(formatDiagnostic(configFile.error));
}

const parsedConfig = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  docsDirectory,
  undefined,
  tsConfigPath,
);
if (parsedConfig.errors.length > 0) {
  throw new Error(parsedConfig.errors.map(formatDiagnostic).join("\n"));
}

const twoslasher = createTwoslasher({
  compilerOptions: parsedConfig.options,
  shouldGetHoverInfo: () => false,
  tsModule: ts,
  vfsRoot: docsDirectory,
});

const failures = [];
for (const path of await listContentFiles(contentDirectory)) {
  const source = await readFile(path, "utf8");
  const codeFence = /^```(tsx?)(?:[^\n]*)\r?\n([\s\S]*?)^```\s*$/gm;

  for (const match of source.matchAll(codeFence)) {
    const language = match[1];
    const code = match[2];
    if (language === undefined || code === undefined) continue;

    try {
      twoslasher(code, language, {
        handbookOptions: { noStaticSemanticInfo: true },
      });
    } catch (error) {
      const line = source.slice(0, match.index).split("\n").length;
      const relativePath = path.slice(docsDirectory.length + 1);
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${relativePath}:${line}\n${message}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`TypeScript code blocks failed:\n\n${failures.join("\n\n")}`);
}

/** @param {string} directory */
async function listContentFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listContentFiles(path)));
    } else if ([".md", ".mdx"].includes(extname(entry.name))) {
      files.push(path);
    }
  }
  return files.sort();
}

/** @param {ts.Diagnostic} diagnostic */
function formatDiagnostic(diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}
