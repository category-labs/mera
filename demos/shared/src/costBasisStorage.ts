import type { CostBasisStore } from "./position";

const STORAGE_PREFIX = "mera.demo.costBasis.";

/** Cost bases in localStorage. Without storage, such as in private mode, P&L resets on reload. */
const costBasisStorage: CostBasisStore = {
  load(address) {
    try {
      return BigInt(localStorage.getItem(STORAGE_PREFIX + address) ?? 0);
    } catch {
      return 0n;
    }
  },
  save(address, basis) {
    try {
      localStorage.setItem(STORAGE_PREFIX + address, basis.toString());
    } catch {
      // Unavailable storage leaves the basis in memory only.
    }
  },
};

export { costBasisStorage };
