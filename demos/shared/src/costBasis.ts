function costBasisAfterBuy(basis: bigint, spentWei: bigint): bigint {
  return basis + spentWei;
}

/**
 * A sell releases the basis proportionally to the shares sold, so the
 * remaining position keeps the average cost of what was paid for it.
 */
function costBasisAfterSell(
  basis: bigint,
  soldShares: bigint,
  sharesBefore: bigint,
): bigint {
  if (soldShares >= sharesBefore || sharesBefore === 0n) return 0n;
  return basis - (basis * soldShares) / sharesBefore;
}

export { costBasisAfterBuy, costBasisAfterSell };
