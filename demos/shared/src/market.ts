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
import type { EvmContext } from "./network";
import { MAX_UINT256, validateTradeAmount } from "./validation";

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
 * so the result stays within 40 +/- 9.10 DEMOCASH and is always positive.
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
  /** Native balance, presented as DEMOCASH. */
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
  if (cash < 0n || shares < 0n || cash > MAX_UINT256 || shares > MAX_UINT256) {
    throw new Error("The network returned an invalid portfolio.");
  }
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
  valueWei: bigint,
): Promise<Fill> {
  validateTradeAmount(valueWei);
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
  validateTradeAmount(shares);
  const hash = await marketClient(session, evm).writeContract({
    address: evm.marketAddress,
    abi: MARKET_ABI,
    functionName: "sell",
    args: [shares],
  });
  return { side: "sell", shares: await minedShares(evm, hash) };
}

// ----- Trade policy -----------------------------------------------------------
// Client-side trading rules; every demo applies the same ones.

type Side = "buy" | "sell";

// How often the demos re-read the portfolio.
const REFRESH_MS = 5_000;
// Cash kept out of Max buys so the account can always pay a trade's network
// fee; at the demo network's gas prices this covers hundreds of trades.
const FEE_RESERVE_WEI = 10n ** 16n;
// One cent, the display resolution: sells that would leave less than this
// behind sell the whole position instead.
const CENT_WEI = 10n ** 16n;
// Cash below this offers the 10,000 DEMOCASH top-up; the guard enforces the
// same threshold, so the button cannot inflate a healthy account.
const LOW_CASH_WEI = 100n * UNIT;

/** Wei to a plain decimal cash string floored to cents, e.g. "9999.99". */
function cashInput(wei: bigint): string {
  const cents = wei / CENT_WEI;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/**
 * The Max amount for the trade input. Buys offer the cash minus the fee
 * reserve. Sells offer the whole position; a position worth less than a cent
 * still offers one cent, because flooring it to "0.00" would parse to
 * nothing and leave the position unsellable from Max.
 */
function maxTradeInput({
  side,
  price,
  portfolio,
}: {
  side: Side;
  price: bigint;
  portfolio: Portfolio;
}): string {
  if (side === "buy") {
    return cashInput(
      portfolio.cash > FEE_RESERVE_WEI ? portfolio.cash - FEE_RESERVE_WEI : 0n,
    );
  }
  const positionValue = (portfolio.shares * price) / UNIT;
  if (positionValue > 0n && positionValue < CENT_WEI) {
    return cashInput(CENT_WEI);
  }
  return cashInput(positionValue);
}

/**
 * Whether the portfolio can pay for the trade. Buys must leave the fee
 * reserve behind. Sells cannot exceed the position (with a cent of slack for
 * price movement between render and submit), must round to at least one
 * share-wei at the current price, and still need the reserve for the trade's
 * network fee.
 */
function coversTrade({
  side,
  amountWei,
  price,
  portfolio,
}: {
  side: Side;
  amountWei: bigint;
  price: bigint;
  portfolio: Portfolio;
}): boolean {
  if (side === "buy") return amountWei + FEE_RESERVE_WEI <= portfolio.cash;
  const positionValue = (portfolio.shares * price) / UNIT;
  return (
    positionValue > 0n &&
    (amountWei * UNIT) / price > 0n &&
    amountWei <= positionValue + CENT_WEI &&
    portfolio.cash >= FEE_RESERVE_WEI
  );
}

/**
 * Shares a sell of `amountWei` moves at `price`. A Max sell, or an amount
 * within a cent of the whole position, sells all of it, so no dust the
 * display would round to 0.00 is left behind.
 */
function sharesToSell({
  amountWei,
  price,
  heldShares,
  sellAll,
}: {
  amountWei: bigint;
  price: bigint;
  heldShares: bigint;
  sellAll: boolean;
}): bigint {
  const shares = (amountWei * UNIT) / price;
  if (sellAll || ((heldShares - shares) * price) / UNIT < CENT_WEI) {
    return heldShares;
  }
  return shares;
}

export type { Fill, Portfolio, Side };
export {
  buyShares,
  COMPANY_NAME,
  coversTrade,
  LOW_CASH_WEI,
  maxTradeInput,
  priceAt,
  REFRESH_MS,
  readPortfolio,
  sellShares,
  sharesToSell,
  TICKER,
  UNIT,
};
