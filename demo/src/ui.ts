/**
 * Formats a wei-scale amount as dollars, e.g. "$10,000.00". Fractions of a
 * cent are floored away; negative amounts keep their sign.
 */
function formatUsd(wei: bigint): string {
  const cents = Number(wei / 10n ** 16n);
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/** Formats an 18-decimal share amount with at most four fraction digits. */
function formatShares(shares: bigint): string {
  const scaled = Number(shares / 10n ** 14n) / 10_000;
  return scaled.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export { formatShares, formatUsd };
