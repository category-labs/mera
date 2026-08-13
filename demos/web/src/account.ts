import type { AccountMode, ConnectedWallet } from "./connect";

/**
 * The account behind the trading surface. "locked" is a reloaded page: the
 * cached public identity shows the portfolio, and the first trade runs a
 * passkey ceremony to restore the signing session.
 */
type AccountState =
  | { status: "none" }
  | { status: "locked"; mode: AccountMode; address: `0x${string}` }
  | { status: "unlocked"; wallet: ConnectedWallet };

/** The address behind an account state; null when signed out. */
function accountAddress(account: AccountState): `0x${string}` | null {
  return account.status === "none"
    ? null
    : account.status === "locked"
      ? account.address
      : account.wallet.account.address;
}

/**
 * The signed-in account's public identity, cached so a reload can show its
 * portfolio without a passkey ceremony. Holds no key material; trading still
 * requires unlocking.
 */
type CachedAccount = {
  mode: AccountMode;
  address: `0x${string}`;
};

const STORAGE_KEY = "mera.demo.account";

function loadCachedAccount(): CachedAccount | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isCachedAccount(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function saveCachedAccount(account: CachedAccount): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
}

function clearCachedAccount(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function isCachedAccount(value: unknown): value is CachedAccount {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CachedAccount>;
  return (
    (record.mode === "passkey" || record.mode === "vault") &&
    typeof record.address === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(record.address)
  );
}

export type { AccountState, CachedAccount };
export {
  accountAddress,
  clearCachedAccount,
  loadCachedAccount,
  saveCachedAccount,
};
