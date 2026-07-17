import type { EvmAddress, Secp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import {
  createWalletClient,
  encodePacked,
  http,
  keccak256,
  parseEventLogs,
} from "viem";
import type { EvmContext } from "./chains/evm";

const COMPANY_NAME = "Nad Computer Company";
const TICKER = "NAD";

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

// ----- Price mirror ----------------------------------------------------------
// Mirror of DemoStock.priceAt, kept in lockstep with the contract: same
// constants, same integer math, so the chart's history matches what the
// contract charges. Quotes and trades still read the chain; the mirror only
// draws history, which one eth_call per point would make needlessly slow.

const UNIT = 10n ** 18n;
const BASE_PRICE = 40n * UNIT;

/** Signed unit noise in [-1e18, 1e18], deterministic per (layerId, bucket). */
function noise(layerId: bigint, bucket: bigint): bigint {
  const hashed = BigInt(
    keccak256(encodePacked(["uint256", "uint256"], [layerId, bucket])),
  );
  return (hashed % (2n * UNIT + 1n)) - UNIT;
}

/**
 * One layer of piecewise-linear value noise, continuous in `timestamp`: the
 * unit noise at the enclosing bucket's two boundaries, linearly interpolated
 * by how far `timestamp` sits into the bucket, scaled to
 * [-amplitude, amplitude].
 */
function noiseLayerAt(
  timestamp: bigint,
  layerId: bigint,
  period: bigint,
  amplitude: bigint,
): bigint {
  const bucket = timestamp / period;
  const startNoise = noise(layerId, bucket);
  const endNoise = noise(layerId, bucket + 1n);
  const interpolated =
    startNoise + ((endNoise - startNoise) * (timestamp % period)) / period;
  return (amplitude * interpolated) / UNIT;
}

/**
 * Share price at Unix `timestamp` (seconds), in native wei per whole share.
 * A slow drift, a medium swing, and a fast wiggle layer on the base price,
 * so the result stays within $40 +/- $9.10 and is always positive.
 */
function priceAt(timestamp: bigint): bigint {
  const slowDrift = noiseLayerAt(timestamp, 1n, 28800n, 6n * UNIT);
  const mediumSwing = noiseLayerAt(timestamp, 2n, 600n, (5n * UNIT) / 2n);
  const fastWiggle = noiseLayerAt(timestamp, 3n, 45n, (3n * UNIT) / 5n);
  const fastJitter = noiseLayerAt(timestamp, 4n, 5n, (3n * UNIT) / 20n);
  return BASE_PRICE + slowDrift + mediumSwing + fastWiggle + fastJitter;
}

// ----- Portfolio and trades ----------------------------------------------------

/** One account's market state, all in wei-scale bigints. */
type Portfolio = {
  /** Native balance, presented as dollars. */
  cash: bigint;
  /** Share balance (18 decimals). */
  shares: bigint;
};

/** A mined trade: the exact share amount from the contract's Transfer event. */
type Fill = {
  side: "buy" | "sell";
  shares: bigint;
};

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
  return { cash, shares };
}

/**
 * A viem wallet client that signs with the session; writes go out as raw
 * transactions, which is the only send path the demo network's guard
 * forwards.
 */
function marketClient(session: Secp256k1SigningSession, evm: EvmContext) {
  return createWalletClient({
    account: toViemAccount(session),
    chain: evm.chain,
    transport: http(evm.rpcUrl),
  });
}

// The Transfer event carries the exact share amount; recomputing it from the
// price would drift a block behind the fill.
async function minedShares(
  evm: EvmContext,
  hash: `0x${string}`,
): Promise<bigint> {
  const receipt = await evm.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("The market rejected the trade. Try a different amount.");
  }
  const [transfer] = parseEventLogs({
    abi: MARKET_ABI,
    eventName: "Transfer",
    logs: receipt.logs,
  });
  return transfer?.args.value ?? 0n;
}

async function buyShares(
  session: Secp256k1SigningSession,
  evm: EvmContext,
  valueWei: bigint,
): Promise<Fill> {
  const hash = await marketClient(session, evm).writeContract({
    address: evm.marketAddress,
    abi: MARKET_ABI,
    functionName: "buy",
    value: valueWei,
  });
  return { side: "buy", shares: await minedShares(evm, hash) };
}

async function sellShares(
  session: Secp256k1SigningSession,
  evm: EvmContext,
  shares: bigint,
): Promise<Fill> {
  const hash = await marketClient(session, evm).writeContract({
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
