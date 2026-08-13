import {
  type Address,
  type Chain,
  createPublicClient,
  defineChain,
  http,
  type PublicClient,
} from "viem";

// The demo's private EVM network. State is wiped on every restart, so nothing
// on it holds value. Override via demos/web/.env to run against a local network.
const RPC_URL =
  import.meta.env.VITE_EVM_RPC_URL ??
  "https://evm-network-production.up.railway.app";

const NETWORK_NAME = "Demo Network";

type EvmContext = {
  chain: Chain;
  publicClient: PublicClient;
  rpcUrl: string;
  marketAddress: Address;
};

/**
 * Calls one of the guard's demo_* methods (see demos/web/network/evm/server.mts)
 * and returns its JSON-RPC result. Throws on an HTTP or JSON-RPC error.
 */
async function demoRequest(
  method: string,
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
  const body = (await response.json()) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (body.error) {
    throw new Error(body.error.message ?? `The network refused ${method}.`);
  }
  return body.result;
}

/**
 * Reads the stock contract's address through the guard's demo_market method.
 * The contract redeploys on every network restart, so the address is asked
 * for rather than hardcoded.
 */
async function fetchMarketAddress(): Promise<Address> {
  const result = (await demoRequest("demo_market", [])) as {
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
 * here (and shows on the card) rather than in the first balance read.
 */
async function resolveEvmContext(): Promise<EvmContext> {
  const bootstrap = createPublicClient({ transport: http(RPC_URL) });
  const [id, marketAddress] = await Promise.all([
    bootstrap.getChainId(),
    fetchMarketAddress(),
  ]);
  const chain = defineChain({
    id,
    name: NETWORK_NAME,
    nativeCurrency: { name: "Demon", symbol: "DEMON", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(RPC_URL),
  });
  return { chain, publicClient, rpcUrl: RPC_URL, marketAddress };
}

/**
 * Asks the guard's demo_fundAccount to top up `address`. Balances below the
 * guard's threshold rise by a fixed amount, a no-op otherwise, so the call
 * is idempotent.
 */
async function fundAccount(address: Address): Promise<void> {
  await demoRequest("demo_fundAccount", [address]);
}

export type { EvmContext };
export { fundAccount, NETWORK_NAME, resolveEvmContext };
