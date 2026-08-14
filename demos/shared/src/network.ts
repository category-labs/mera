import {
  type Address,
  type Chain,
  createPublicClient,
  defineChain,
  http,
  type PublicClient,
} from "viem";
import { assertDemoChainId } from "./validation";

// The demo's private EVM network. State is wiped on every restart, so nothing
// on it holds value.
const DEMO_RPC_URL = "https://evm-network-production.up.railway.app";

// The chain id the demo network reports.
const DEMO_CHAIN_ID = 31337;

const NETWORK_NAME = "Demo Network";

type EvmContext = {
  chain: Chain;
  publicClient: PublicClient;
  rpcUrl: string;
  marketAddress: Address;
};

type JsonRpcBody = {
  jsonrpc?: unknown;
  id?: unknown;
  result?: unknown;
  error?: { message?: unknown };
};

type DemoMethod = "demo_fundAccount" | "demo_market";

function isJsonRpcBody(value: unknown): value is JsonRpcBody {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonRpcResult(value: unknown, method: string): unknown {
  if (!isJsonRpcBody(value) || value.jsonrpc !== "2.0" || value.id !== 1) {
    throw new Error("The network reply is malformed.");
  }
  if (value.error !== undefined) {
    const message = value.error?.message;
    throw new Error(
      typeof message === "string" ? message : `The network refused ${method}.`,
    );
  }
  if (!("result" in value)) throw new Error("The network reply has no result.");
  return value.result;
}

/**
 * Calls one of the demo network guard's demo_* methods and returns its
 * JSON-RPC result. Throws on an HTTP or JSON-RPC error.
 */
async function demoRequest(
  rpcUrl: string,
  method: DemoMethod,
  params: unknown[],
): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) {
    throw new Error(`The network answered with status ${response.status}.`);
  }
  const value: unknown = await response.json();
  return jsonRpcResult(value, method);
}

/**
 * Reads the stock contract's address through the guard's demo_market method.
 * The contract redeploys on every network restart, so the address is asked
 * for rather than hardcoded.
 */
async function fetchMarketAddress(rpcUrl: string): Promise<Address> {
  const result = (await demoRequest(rpcUrl, "demo_market", [])) as {
    address?: unknown;
  } | null;
  const address = result?.address;
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("The network reported no market address.");
  }
  return address as Address;
}

/**
 * Connects to the demo network. The chain id and market address are read from
 * the endpoint rather than hardcoded, so the demo follows whatever the network
 * reports; the reads also probe connectivity, so an unreachable endpoint fails
 * here (and shows in the UI) rather than in the first balance read. With
 * `expectedChainId` set, a network reporting a different chain id is refused
 * instead of adopted.
 */
async function resolveEvmContext({
  rpcUrl,
  expectedChainId,
}: {
  rpcUrl: string;
  expectedChainId?: number;
}): Promise<EvmContext> {
  const bootstrap = createPublicClient({ transport: http(rpcUrl) });
  const [id, marketAddress] = await Promise.all([
    bootstrap.getChainId(),
    fetchMarketAddress(rpcUrl),
  ]);
  if (expectedChainId !== undefined) {
    assertDemoChainId(id, expectedChainId);
  }
  const chain = defineChain({
    id,
    name: NETWORK_NAME,
    nativeCurrency: { name: "Demon", symbol: "DEMON", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  return { chain, publicClient, rpcUrl, marketAddress };
}

/**
 * Asks the guard's demo_fundAccount to top up `address`. Balances below the
 * guard's threshold rise by a fixed amount, a no-op otherwise, so the call
 * is idempotent.
 */
async function fundAccount(rpcUrl: string, address: Address): Promise<void> {
  await demoRequest(rpcUrl, "demo_fundAccount", [address]);
}

export type { EvmContext };
export {
  DEMO_CHAIN_ID,
  DEMO_RPC_URL,
  fundAccount,
  isJsonRpcBody,
  jsonRpcResult,
  NETWORK_NAME,
  resolveEvmContext,
};
