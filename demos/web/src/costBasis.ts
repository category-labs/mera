// Cost basis of the open position, per address in localStorage so P&L
// survives reloads. Only the demo's UI reads it; the chain stays the
// authority on balances.

const STORAGE_PREFIX = "mera.demo.costBasis.";

/** The cash currently invested in the open position, in wei. */
function loadCostBasis(address: string): bigint {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + address);
    return raw ? BigInt(raw) : 0n;
  } catch {
    return 0n;
  }
}

function saveCostBasis(address: string, basis: bigint): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + address, basis.toString());
  } catch {
    // Storage may be unavailable (private mode); the P&L then just resets
    // on reload.
  }
}

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

export { costBasisAfterBuy, costBasisAfterSell, loadCostBasis, saveCostBasis };
