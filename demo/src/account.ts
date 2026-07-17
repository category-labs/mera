import type { AccountMode } from "./connect";

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

export type { CachedAccount };
export { clearCachedAccount, loadCachedAccount, saveCachedAccount };
