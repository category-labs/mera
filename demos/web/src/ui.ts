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

/** Shortens a 0x address for display, e.g. "0x1234…cdef". */
function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Formats an 18-decimal share amount with at most four fraction digits. */
function formatShares(shares: bigint): string {
  const scaled = Number(shares / 10n ** 14n) / 10_000;
  return scaled.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export { CASH_SYMBOL, formatCash, formatShares, truncateAddress };
