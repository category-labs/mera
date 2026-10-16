import { type Fill, TICKER } from "./market";

/** The demo's currency name; every balance is play money. */
const CASH_SYMBOL = "DEMOCASH";

/**
 * Formats a wei-scale cash amount as a bare number, e.g. "10,000.00".
 * Fractions of a cent are floored away; negative amounts keep their sign.
 */
function formatCash(wei: bigint): string {
  const cents = Number(wei / 10n ** 16n);
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Formats cash with an explicit sign, e.g. "+12.34" or "-0.50". */
function formatSignedCash(wei: bigint): string {
  return `${wei < 0n ? "" : "+"}${formatCash(wei)}`;
}

/**
 * Formats a gain or loss with its share of the cost basis, e.g.
 * "+12.34 · +5.00%". A zero basis has no share, so only the cash shows.
 */
function formatPnl(pnl: bigint, basis: bigint): string {
  if (basis === 0n) return formatSignedCash(pnl);
  const percent = Number((pnl * 10_000n) / basis) / 100;
  return `${formatSignedCash(pnl)} · ${percent < 0 ? "" : "+"}${percent.toFixed(2)}%`;
}

/** Formats an 18-decimal share amount with at most four fraction digits. */
function formatShares(shares: bigint): string {
  const scaled = Number(shares / 10n ** 14n) / 10_000;
  return scaled.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** The status line for a mined trade, e.g. "Bought 2.5 NAD for 100.00 DEMOCASH". */
function fillText(fill: Fill): string {
  return fill.side === "buy"
    ? `Bought ${formatShares(fill.shares)} ${TICKER} for ${formatCash(fill.spent)} ${CASH_SYMBOL}`
    : `Sold ${formatShares(fill.shares)} ${TICKER}`;
}

/** Shortens a 0x address for display, e.g. "0x1234…cdef". */
function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export {
  CASH_SYMBOL,
  fillText,
  formatCash,
  formatPnl,
  formatShares,
  formatSignedCash,
  truncateAddress,
};
