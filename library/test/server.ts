import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import {
  extname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const contentTypes: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
};

// The test page imports the library by its package name, which transitively
// pulls in bare specifiers from `@noble/*`. Browsers can't resolve bare
// specifiers, so we map them to files the server already serves.
const importMap = JSON.stringify({
  imports: {
    "@category-labs/mera": "/dist/index.js",
    "@noble/curves/ed25519.js": "/node_modules/@noble/curves/ed25519.js",
    "@noble/curves/secp256k1.js": "/node_modules/@noble/curves/secp256k1.js",
    "@noble/hashes/hmac.js": "/node_modules/@noble/hashes/hmac.js",
    "@noble/hashes/sha2.js": "/node_modules/@noble/hashes/sha2.js",
    "@noble/hashes/sha3.js": "/node_modules/@noble/hashes/sha3.js",
    "@noble/hashes/utils.js": "/node_modules/@noble/hashes/utils.js",
    "@scure/base": "/node_modules/@scure/base/index.js",
  },
});

const indexHtml = `<!doctype html><html><head><script type="importmap">${importMap}</script></head><body><main id="app"></main></body></html>`;
const libraryPath = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryPath = resolve(libraryPath, "..");

export async function startTestServer(): Promise<{
  url: string;
  close(): Promise<void>;
}> {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const servedRoot = pathname.startsWith("/node_modules/")
        ? repositoryPath
        : libraryPath;
      const filePath = resolve(join(servedRoot, normalize(pathname)));
      const relativePath = relative(servedRoot, filePath);

      if (
        relativePath === ".." ||
        relativePath.startsWith(`..${sep}`) ||
        isAbsolute(relativePath)
      ) {
        response.writeHead(403).end();
        return;
      }

      if (pathname === "/index.html") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(indexHtml);
        return;
      }

      const body = await readFile(filePath);
      response.writeHead(200, {
        "content-type":
          contentTypes[extname(filePath)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });

  await new Promise<void>((resolveListening) => {
    server.listen(0, "127.0.0.1", resolveListening);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Unable to start test server");
  }

  return {
    url: `http://localhost:${address.port}`,
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      }),
  };
}
