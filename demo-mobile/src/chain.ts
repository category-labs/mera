import { createPublicClient, formatEther, http } from "viem";
import { evmRpcUrl } from "./config";

const publicClient = createPublicClient({ transport: http(evmRpcUrl) });

/** The account's balance on the demo network, in whole units. */
async function fetchBalance(address: `0x${string}`): Promise<string> {
  return formatEther(await publicClient.getBalance({ address }));
}

export { fetchBalance };
