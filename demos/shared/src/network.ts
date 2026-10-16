import {
  type Address,
  createPublicClient,
  defineChain,
  http,
  isAddress,
  rpcSchema,
} from "viem";

// The demo's private EVM network. State is wiped on every restart, so nothing
// on it holds value.
const DEMO_RPC_URL = "https://evm-network-production.up.railway.app";
const NETWORK_NAME = "Demo Network";
const RESOLVE_RETRY_MS = 5_000;

const demoChain = defineChain({
  id: 31337,
  name: NETWORK_NAME,
  nativeCurrency: { name: "Demon", symbol: "DEMON", decimals: 18 },
  rpcUrls: { default: { http: [DEMO_RPC_URL] } },
});

// The methods the network's guard adds to JSON-RPC. The market reply is
// untrusted, so its type makes the caller check it.
type DemoRpcSchema = [
  {
    Method: "demo_market";
    Parameters?: undefined;
    ReturnType: { address?: unknown } | null;
  },
  { Method: "demo_fundAccount"; Parameters: [Address]; ReturnType: unknown },
];

function demoClient(rpcUrl: string) {
  return createPublicClient({
    chain: demoChain,
    transport: http(rpcUrl),
    rpcSchema: rpcSchema<DemoRpcSchema>(),
  });
}

type EvmContext = {
  publicClient: ReturnType<typeof demoClient>;
  rpcUrl: string;
  marketAddress: Address;
};

/**
 * Connects to the demo network and asks it for the stock contract's address,
 * which changes because the contract redeploys on every network restart. The
 * request also probes the endpoint, so an unreachable network fails here.
 */
async function resolveEvmContext(rpcUrl: string): Promise<EvmContext> {
  const publicClient = demoClient(rpcUrl);
  const market = await publicClient.request({ method: "demo_market" });
  const marketAddress = market?.address;
  if (
    typeof marketAddress !== "string" ||
    !isAddress(marketAddress, { strict: false })
  ) {
    throw new Error("The network reported no market address.");
  }
  return { publicClient, rpcUrl, marketAddress };
}

/**
 * Calls `resolve` until it succeeds, waiting RESOLVE_RETRY_MS after each
 * failure, because a restarting network can take a minute to answer. Each
 * failure reaches `onError`. Returns a stop function; after it runs, no
 * callback fires.
 */
function retryingResolve<T>(
  resolve: () => Promise<T>,
  onResolved: (value: T) => void,
  onError: (error: unknown) => void,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function attempt(): void {
    resolve().then(
      (value) => {
        if (!stopped) onResolved(value);
      },
      (error: unknown) => {
        if (stopped) return;
        onError(error);
        timer = setTimeout(attempt, RESOLVE_RETRY_MS);
      },
    );
  }
  attempt();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/**
 * Asks the guard's faucet to top up `address`. It credits only balances below
 * its threshold, so repeated calls are safe.
 */
async function fundAccount(evm: EvmContext, address: Address): Promise<void> {
  await evm.publicClient.request({
    method: "demo_fundAccount",
    params: [address],
  });
}

export type { EvmContext };
export {
  DEMO_RPC_URL,
  demoChain,
  fundAccount,
  NETWORK_NAME,
  resolveEvmContext,
  retryingResolve,
};
