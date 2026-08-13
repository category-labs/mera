const CASH_SYMBOL = "DEMOCASH";

function formatCash(wei: bigint): string {
  const cents = Number(wei / 10n ** 16n);
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatShares(shares: bigint): string {
  const scaled = Number(shares / 10n ** 14n) / 10_000;
  return scaled.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export { CASH_SYMBOL, formatCash, formatShares, truncateAddress };
