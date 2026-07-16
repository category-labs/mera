import {
  type Account,
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
type EthereumContext = {
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
async function resolveEthereumContext(): Promise<EthereumContext> {
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

export type { EthereumContext };
export { createTransactionClient, resolveEthereumContext };
