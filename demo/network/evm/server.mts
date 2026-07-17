// JSON-RPC guard in front of the demo network's anvil node.
//
// Anvil exposes cheat methods (anvil_*, evm_*, hardhat_*) that let any caller
// rewrite chain state. This server owns the public port instead: anvil binds
// to localhost inside the container, ordinary JSON-RPC namespaces are
// forwarded, and everything else is refused. Funding happens through one
// guarded method, demo_fundAccount, whose policy lives here on the server.
// The guard also deploys the demo's stock contract at boot and reports its
// address through demo_market.
//
// The file runs directly under Node 24's type stripping, so it must stay
// within erasable TypeScript syntax; tsconfig.json enforces that. The .mts
// extension pins the module format to ESM: a plain .ts file's format depends
// on the nearest package.json, and the container copies this file without
// one.
import { spawn } from "node:child_process";
import http from "node:http";
import { DEMO_STOCK_CREATION_BYTECODE } from "./demoStock.mts";

const PORT = Number(process.env.PORT ?? 8545);
const ANVIL_URL = "http://127.0.0.1:8546";
// Method namespaces the network exposes; every other method is refused.
const ALLOWED_PREFIXES = ["eth_", "net_", "web3_"];
// Methods within the allowed namespaces that sign or send with anvil's
// unlocked dev accounts. Refused so the node never signs for a caller,
// which would sidestep demo_fundAccount as a way to move funds; the demo
// signs locally and broadcasts raw transactions.
const REFUSED_METHODS = new Set([
  "eth_sendTransaction",
  "eth_signTransaction",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
]);
// Funding policy: balances below the threshold are raised by the top-up,
// which reads as the $10,000 a paper-trading account opens with; the
// threshold keeps a funded account from being credited twice. The app asks
// at connect and through an explicit button, never on balance reads.
const MIN_BALANCE_WEI = 100n * 10n ** 18n;
const TOP_UP_WEI = 10_000n * 10n ** 18n;
// Payout reserve seeded into the stock contract at boot; orders of magnitude
// more than funded accounts can win from it.
const MARKET_LIQUIDITY_WEI = 10n ** 27n;
// Large enough for any raw transaction the demo produces; requests beyond
// this are rejected with 413.
const MAX_BODY_BYTES = 128 * 1024;

// Anvil runs as a child on localhost, so the cheat methods are reachable
// only from this process. The guard exits when anvil dies and the platform
// restarts the container, which is the network's designed recovery path.
// Mixed mining mines transactions instantly and adds an interval block every
// second, so the head timestamp, and with it the stock price, moves at the
// finest pace a second-granular timestamp allows.
const anvil = spawn(
  "anvil",
  [
    "--network",
    "monad",
    "--host",
    "127.0.0.1",
    "--port",
    "8546",
    "--mixed-mining",
    "--block-time",
    "1",
  ],
  { stdio: ["ignore", "inherit", "inherit"] },
);
anvil.on("exit", (code) => {
  console.error(`anvil exited with code ${code}`);
  process.exit(1);
});

// Stop anvil and exit on the platform's stop signals. As PID 1 in the
// container the process has no default signal dispositions, so without
// these handlers a stop would hang until the force-kill timeout. Killing
// anvil also covers local runs, where it would otherwise outlive the guard
// and keep its port.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    anvil.kill(signal);
    process.exit(0);
  });
}

async function anvilRequest(
  method: string,
  params: unknown[],
): Promise<unknown> {
  const response = await fetch(ANVIL_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (body.error) {
    throw new Error(body.error.message ?? `anvil refused ${method}`);
  }
  return body.result;
}

async function anvilQuantity(
  method: string,
  params: unknown[],
): Promise<bigint> {
  const result = await anvilRequest(method, params);
  if (typeof result !== "string") {
    throw new Error(`${method} returned a non-string result`);
  }
  return BigInt(result);
}

// Raises `address`'s balance to current + TOP_UP_WEI when it sits below the
// threshold, and is a no-op otherwise, so callers can invoke it
// idempotently. Adding to the current balance (anvil_setBalance is absolute)
// preserves amounts received while the account was below the threshold.
// Returns the resulting balance as a hex quantity.
async function fundAccount(address: string): Promise<string> {
  const balance = await anvilQuantity("eth_getBalance", [address, "latest"]);
  if (balance < MIN_BALANCE_WEI) {
    const funded = balance + TOP_UP_WEI;
    await anvilRequest("anvil_setBalance", [
      address,
      `0x${funded.toString(16)}`,
    ]);
    return `0x${funded.toString(16)}`;
  }
  return `0x${balance.toString(16)}`;
}

// The demo's stock market, deployed fresh on every boot because anvil's
// state lives in memory only. Set before the server starts listening.
let marketAddress = "";

/**
 * Deploys the stock contract from anvil's first unlocked dev account and
 * seeds its payout reserve. Using eth_sendTransaction here does not
 * contradict refusing it for external callers: anvil is reachable only from
 * this process.
 */
async function deployMarket(): Promise<string> {
  const accounts = await anvilRequest("eth_accounts", []);
  const deployer = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof deployer !== "string") {
    throw new Error("anvil returned no unlocked accounts");
  }
  const hash = await anvilRequest("eth_sendTransaction", [
    { from: deployer, data: DEMO_STOCK_CREATION_BYTECODE },
  ]);
  // anvil mines each transaction into its own block, but the receipt can lag
  // the send by a moment, so poll briefly instead of reading once.
  for (let attempt = 0; attempt < 100; attempt++) {
    const receipt = (await anvilRequest("eth_getTransactionReceipt", [
      hash,
    ])) as { contractAddress?: unknown } | null;
    const address = receipt?.contractAddress;
    if (typeof address === "string") {
      await anvilRequest("anvil_setBalance", [
        address,
        `0x${MARKET_LIQUIDITY_WEI.toString(16)}`,
      ]);
      return address;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("the deploy receipt reports no contract address");
}

// Permissive CORS on every response, since the demo calls the network
// directly from the browser.
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

// A JSON-RPC id is a string, a number, or null; anything else a caller
// sends is replaced with null rather than echoed back.
function rpcId(id: unknown): string | number | null {
  return typeof id === "string" || typeof id === "number" ? id : null;
}

function rpcError(id: unknown, code: number, message: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: rpcId(id),
    error: { code, message },
  });
}

function rpcResult(id: unknown, result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id: rpcId(id), result });
}

function respond(
  response: http.ServerResponse,
  status: number,
  body: string | Buffer,
): void {
  response.writeHead(status, {
    "content-type": "application/json",
    ...CORS_HEADERS,
  });
  response.end(body);
}

async function handle(
  request: http.IncomingMessage,
  response: http.ServerResponse,
): Promise<void> {
  if (request.method === "OPTIONS") {
    // A preflight response carries no body, so 204 with the CORS headers
    // alone.
    response.writeHead(204, CORS_HEADERS);
    response.end();
    return;
  }
  if (request.method !== "POST") {
    respond(response, 405, rpcError(null, -32600, "Only POST is supported."));
    return;
  }

  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    received += chunk.length;
    if (received > MAX_BODY_BYTES) {
      respond(
        response,
        413,
        rpcError(null, -32600, "The request body is too large."),
      );
      // Responding does not stop the caller from streaming the rest of the
      // declared body into the open connection; drop the connection too.
      request.destroy();
      return;
    }
    chunks.push(chunk);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    respond(
      response,
      400,
      rpcError(null, -32700, "The request body is not valid JSON."),
    );
    return;
  }
  if (Array.isArray(payload)) {
    respond(
      response,
      400,
      rpcError(null, -32600, "Batch requests are not supported."),
    );
    return;
  }
  const { id, method, params } = (payload ?? {}) as {
    id?: unknown;
    method?: unknown;
    params?: unknown;
  };
  if (typeof method !== "string") {
    respond(response, 400, rpcError(id, -32600, "The request has no method."));
    return;
  }

  if (method === "demo_market") {
    respond(response, 200, rpcResult(id, { address: marketAddress }));
    return;
  }

  if (method === "demo_fundAccount") {
    const address = Array.isArray(params) ? params[0] : undefined;
    if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      respond(
        response,
        200,
        rpcError(id, -32602, "params must be a single 0x-prefixed address."),
      );
      return;
    }
    try {
      respond(response, 200, rpcResult(id, await fundAccount(address)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      respond(
        response,
        200,
        rpcError(id, -32603, `Funding failed: ${message}`),
      );
    }
    return;
  }

  if (
    REFUSED_METHODS.has(method) ||
    !ALLOWED_PREFIXES.some((prefix) => method.startsWith(prefix))
  ) {
    respond(
      response,
      200,
      rpcError(id, -32601, `The demo network does not expose ${method}.`),
    );
    return;
  }

  try {
    const upstream = await fetch(ANVIL_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    respond(
      response,
      upstream.status,
      Buffer.from(await upstream.arrayBuffer()),
    );
  } catch {
    respond(
      response,
      502,
      rpcError(id, -32603, "The network node is not responding."),
    );
  }
}

// Serve only once anvil answers, so the platform's routing never sees a
// listening guard with a dead node behind it during boot.
for (let attempt = 0; ; attempt++) {
  try {
    await anvilRequest("eth_chainId", []);
    break;
  } catch {
    if (attempt >= 100) {
      console.error("anvil did not become ready");
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

try {
  marketAddress = await deployMarket();
} catch (error) {
  // Exit rather than serve without a market; the platform restarts the
  // container, matching the recovery path for a dead anvil. Killing anvil
  // matters for local runs, where it would otherwise outlive the guard and
  // keep its port.
  console.error(`market deploy failed: ${String(error)}`);
  anvil.kill("SIGTERM");
  process.exit(1);
}

http
  .createServer((request, response) => {
    handle(request, response).catch(() => {
      respond(response, 500, rpcError(null, -32603, "Internal error."));
    });
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(`guard listening on ${PORT}, anvil on ${ANVIL_URL}`);
  });
