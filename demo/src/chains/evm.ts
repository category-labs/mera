import {
  type Account,
  type Address,
  type Chain,
  createPublicClient,
  createWalletClient as createViemTransactionClient,
  defineChain,
  type HttpTransport,
  http,
  type PublicClient,
  type WalletClient as ViemTransactionClient,
} from "viem";

// The demo's private EVM network. State is wiped on every restart, so nothing
// on it holds value. Override via demo/.env to run against a local network.
const RPC_URL =
  import.meta.env.VITE_EVM_RPC_URL ??
  "https://evm-network-production.up.railway.app";

/** The resolved chain paired with a public client bound to it. */
type EvmContext = {
  chain: Chain;
  publicClient: PublicClient;
  rpcUrl: string;
};

/**
 * Connects to the demo network. The chain id is read from the endpoint rather
 * than hardcoded, so the demo follows whatever the network reports; the read
 * also probes connectivity, so an unreachable endpoint fails here (and shows
 * on the card) rather than in the first balance read.
 */
async function resolveEvmContext(): Promise<EvmContext> {
  const bootstrap = createPublicClient({ transport: http(RPC_URL) });
  const id = await bootstrap.getChainId();
  const chain = defineChain({
    id,
    name: "Demo Network",
    nativeCurrency: { name: "Demon", symbol: "DEMON", decimals: 18 },
    rpcUrls: { default: { http: [RPC_URL] } },
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(RPC_URL),
  });
  return { chain, publicClient, rpcUrl: RPC_URL };
}

/**
 * Asks the network to fund `address` through the guard's demo_fundAccount
 * method (see demo/network/evm/server.mts). The guard tops a balance below
 * its threshold up by a fixed amount and is a no-op otherwise, so the call
 * is idempotent; anvil's cheat methods themselves are not exposed.
 */
async function fundAccount(address: Address): Promise<void> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "demo_fundAccount",
      params: [address],
    }),
  });
  if (!response.ok) {
    throw new Error(`Funding failed with status ${response.status}.`);
  }
  const body = (await response.json()) as { error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? "Funding failed.");
  }
}

/**
 * Creates a viem transaction client bound to a passkey-backed account and chain.
 */
function createTransactionClient(
  account: Account,
  chain: Chain,
  rpcUrl: string,
): ViemTransactionClient<HttpTransport, Chain, Account> {
  return createViemTransactionClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
}

export type { EvmContext };
export { createTransactionClient, fundAccount, resolveEvmContext };
