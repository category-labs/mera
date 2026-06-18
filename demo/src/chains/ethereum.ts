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
import { foundry, mainnet, monad, monadTestnet, sepolia } from "viem/chains";
import { cachePerNetwork, type NetworkMode } from "../network";

const MONAD_MAINNET_RPC_URL = "https://rpc.monad.xyz";

const KNOWN_CHAINS: Record<number, Chain> = {
  [mainnet.id]: mainnet,
  [sepolia.id]: sepolia,
  [foundry.id]: foundry,
  [monad.id]: monad,
  [monadTestnet.id]: monadTestnet,
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
  const chain =
    KNOWN_CHAINS[id] ??
    defineChain({
      id,
      name: `Chain ${id}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    });
  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  return { chain, publicClient, rpcUrl };
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
