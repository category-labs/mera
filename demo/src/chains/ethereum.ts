import {
  type Account,
  type Chain,
  createPublicClient,
  createWalletClient as createViemTransactionClient,
  type HttpTransport,
  http,
  type PublicClient,
  type WalletClient as ViemTransactionClient,
} from "viem";
import { foundry, mainnet, monad, monadTestnet, sepolia } from "viem/chains";
import { cachePerNetwork, type NetworkMode } from "../network";

const MONAD_MAINNET_RPC_URL = "https://rpc.monad.xyz";

// Each chain the demo recognizes, keyed by chain id and tagged with the network
// mode it belongs to. Resolution looks the RPC's chain id up here and requires
// the mode to match, so the "Testnet"/"Mainnet" toggle can never disagree with
// the chain that is signed for and broadcast to. Add a row to support a new one.
const KNOWN_CHAINS: Record<number, { chain: Chain; mode: NetworkMode }> = {
  [mainnet.id]: { chain: mainnet, mode: "mainnet" },
  [monad.id]: { chain: monad, mode: "mainnet" },
  [sepolia.id]: { chain: sepolia, mode: "testnet" },
  [monadTestnet.id]: { chain: monadTestnet, mode: "testnet" },
  [foundry.id]: { chain: foundry, mode: "testnet" },
};

/** A resolved chain paired with a public client bound to it. */
type EthereumContext = {
  chain: Chain;
  publicClient: PublicClient;
  rpcUrl: string;
};

function rpcUrlForMode(networkMode: NetworkMode): string {
  if (networkMode === "mainnet") {
    return (
      import.meta.env.VITE_ETHEREUM_MAINNET_RPC_URL ?? MONAD_MAINNET_RPC_URL
    );
  }
  return (
    import.meta.env.VITE_ETHEREUM_TESTNET_RPC_URL ??
    monadTestnet.rpcUrls.default.http[0]
  );
}

async function resolveEthereumContext(
  networkMode: NetworkMode,
): Promise<EthereumContext> {
  const rpcUrl = rpcUrlForMode(networkMode);
  const bootstrap = createPublicClient({ transport: http(rpcUrl) });
  const id = await bootstrap.getChainId();
  const known = KNOWN_CHAINS[id];
  if (!known) {
    throw new Error(
      `The ${networkMode} RPC is on chain id ${id}, which the demo doesn't recognize.`,
    );
  }
  if (known.mode !== networkMode) {
    throw new Error(
      `The ${networkMode} RPC is on ${known.chain.name} (chain id ${id}), which belongs to ${known.mode}.`,
    );
  }
  const publicClient = createPublicClient({
    chain: known.chain,
    transport: http(rpcUrl),
  });
  return { chain: known.chain, publicClient, rpcUrl };
}

/**
 * Resolves the chain by reading the chain id from the selected RPC, then caches
 * it; reused on later calls for the same network.
 */
const getEthereumContext = cachePerNetwork(resolveEthereumContext);

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

/** Builds a block-explorer transaction URL for a chain. */
function explorerTxUrl(chain: Chain, hash: string): string | undefined {
  const base = chain.blockExplorers?.default.url;
  return base ? `${base}/tx/${hash}` : undefined;
}

export type { EthereumContext };
export { createTransactionClient, explorerTxUrl, getEthereumContext };
