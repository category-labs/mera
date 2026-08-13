import type { EvmAddress, Secp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import {
  createWalletClient,
  encodePacked,
  http,
  isAddressEqual,
  keccak256,
  parseEventLogs,
} from "viem";
import { MAX_UINT256, RPC_URL } from "./config";
import type { EvmContext } from "./network";
import { validateTradeAmount } from "./validation";

const COMPANY_NAME = "Nad Computer Company";
const TICKER = "NAD";
const UNIT = 10n ** 18n;
const BASE_PRICE = 40n * UNIT;

const MARKET_ABI = [
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const;

type Portfolio = { cash: bigint; shares: bigint };
type Fill = { side: "buy" | "sell"; shares: bigint };

function noise(layerId: bigint, bucket: bigint): bigint {
  const hash = BigInt(
    keccak256(encodePacked(["uint256", "uint256"], [layerId, bucket])),
  );
  return (hash % (2n * UNIT + 1n)) - UNIT;
}

function noiseLayerAt(
  timestamp: bigint,
  layerId: bigint,
  period: bigint,
  amplitude: bigint,
): bigint {
  const bucket = timestamp / period;
  const start = noise(layerId, bucket);
  const end = noise(layerId, bucket + 1n);
  return (
    (amplitude * (start + ((end - start) * (timestamp % period)) / period)) /
    UNIT
  );
}

function priceAt(timestamp: bigint): bigint {
  return (
    BASE_PRICE +
    noiseLayerAt(timestamp, 1n, 28800n, 6n * UNIT) +
    noiseLayerAt(timestamp, 2n, 600n, (5n * UNIT) / 2n) +
    noiseLayerAt(timestamp, 3n, 45n, (3n * UNIT) / 5n) +
    noiseLayerAt(timestamp, 4n, 5n, (3n * UNIT) / 20n)
  );
}

async function readPortfolio(
  evm: EvmContext,
  address: EvmAddress,
): Promise<Portfolio> {
  const [cash, shares] = await Promise.all([
    evm.publicClient.getBalance({ address }),
    evm.publicClient.readContract({
      address: evm.marketAddress,
      abi: MARKET_ABI,
      functionName: "balanceOf",
      args: [address],
    }),
  ]);
  if (cash < 0n || shares < 0n || cash > MAX_UINT256 || shares > MAX_UINT256) {
    throw new Error("The network returned an invalid portfolio.");
  }
  return { cash, shares };
}

async function minedShares(
  evm: EvmContext,
  hash: `0x${string}`,
): Promise<bigint> {
  const receipt = await evm.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error("The market rejected the trade. Try a different amount.");
  const [transfer] = parseEventLogs({
    abi: MARKET_ABI,
    eventName: "Transfer",
    logs: receipt.logs.filter((log) =>
      isAddressEqual(log.address, evm.marketAddress),
    ),
  });
  const shares = transfer?.args.value;
  if (shares === undefined || shares <= 0n || shares > MAX_UINT256) {
    throw new Error("The market returned an invalid fill.");
  }
  return shares;
}

async function buyShares(
  session: Secp256k1SigningSession,
  evm: EvmContext,
  value: bigint,
): Promise<Fill> {
  validateTradeAmount(value);
  const client = createWalletClient({
    account: toViemAccount(session),
    chain: evm.chain,
    transport: http(RPC_URL),
  });
  const hash = await client.writeContract({
    address: evm.marketAddress,
    abi: MARKET_ABI,
    functionName: "buy",
    value,
  });
  return { side: "buy", shares: await minedShares(evm, hash) };
}

async function sellShares(
  session: Secp256k1SigningSession,
  evm: EvmContext,
  shares: bigint,
): Promise<Fill> {
  validateTradeAmount(shares);
  const client = createWalletClient({
    account: toViemAccount(session),
    chain: evm.chain,
    transport: http(RPC_URL),
  });
  const hash = await client.writeContract({
    address: evm.marketAddress,
    abi: MARKET_ABI,
    functionName: "sell",
    args: [shares],
  });
  return { side: "sell", shares: await minedShares(evm, hash) };
}

export type { Fill, Portfolio };
export {
  buyShares,
  COMPANY_NAME,
  priceAt,
  readPortfolio,
  sellShares,
  TICKER,
  UNIT,
};
