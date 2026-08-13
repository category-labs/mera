import {
  type Address,
  type Chain,
  createPublicClient,
  defineChain,
  http,
  type PublicClient,
} from "viem";
import { DEMO_CHAIN_ID, RPC_URL } from "./config";
import { assertDemoChainId } from "./validation";

type EvmContext = {
  chain: Chain;
  publicClient: PublicClient;
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

async function demoRequest(
  method: DemoMethod,
  params: unknown[],
): Promise<unknown> {
  const response = await fetch(RPC_URL, {
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

async function resolveEvmContext(): Promise<EvmContext> {
  const bootstrap = createPublicClient({ transport: http(RPC_URL) });
  const chainId = await bootstrap.getChainId();
  assertDemoChainId(chainId, DEMO_CHAIN_ID);
  const market = await demoRequest("demo_market", []);
  const address =
    market && typeof market === "object"
      ? (market as Record<string, unknown>).address
      : undefined;
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("The network reported no market address.");
  }
  const chain = defineChain({
    id: DEMO_CHAIN_ID,
    name: "Demo Network",
    nativeCurrency: { name: "Demon", symbol: "DEMON", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  });
  return {
    chain,
    publicClient: createPublicClient({ chain, transport: http(RPC_URL) }),
    marketAddress: address as Address,
  };
}

async function fundAccount(address: Address): Promise<void> {
  await demoRequest("demo_fundAccount", [address]);
}

export type { EvmContext };
export { fundAccount, isJsonRpcBody, jsonRpcResult, resolveEvmContext };
