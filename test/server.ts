import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const contentTypes: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
};

// The test page imports `/dist/index.js`, which transitively pulls in bare specifiers
// from `@noble/*`. Browsers can't resolve bare specifiers, so we map them to the
// files the server already serves out of `node_modules/`.
const importMap = JSON.stringify({
  imports: {
    "@noble/ed25519": "/node_modules/@noble/ed25519/index.js",
    "@noble/hashes/sha2.js": "/node_modules/@noble/hashes/sha2.js",
    "@noble/hashes/sha3.js": "/node_modules/@noble/hashes/sha3.js",
    "@noble/hashes/utils.js": "/node_modules/@noble/hashes/utils.js",
    "@noble/secp256k1": "/node_modules/@noble/secp256k1/index.js",
    "@scure/base": "/node_modules/@scure/base/index.js",
  },
});

const indexHtml = `<!doctype html><html><head><script type="importmap">${importMap}</script></head><body><main id="app"></main></body></html>`;

export async function startTestServer(): Promise<{
  url: string;
  close(): Promise<void>;
}> {
  const rootPath = process.cwd();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = resolve(join(rootPath, normalize(pathname)));

      if (!filePath.startsWith(rootPath)) {
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
