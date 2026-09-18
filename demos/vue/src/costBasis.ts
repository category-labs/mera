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

export { loadCostBasis, saveCostBasis };
