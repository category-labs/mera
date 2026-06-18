import type { PasskeyCredentialTransport } from "mera";

/**
 * Non-secret metadata for a derived wallet created on this device.
 *
 * It holds no key material — only what the app needs to (a) pin the right
 * passkey with `allowCredentials` on the next same-device sign-in, instead of
 * showing every discoverable credential, and (b) remember how many HD accounts
 * the current wallet had derived so sign-in can restore them. A fresh device
 * simply has no record and falls back to a discoverable sign-in.
 */
type DerivedWalletRecord = {
  credentialId: string;
  transports?: PasskeyCredentialTransport[];
  label: string;
  accountCount: number;
};

const REGISTRY_KEY = "mera.demo.derivedWallets";

function currentDerivedWallet(): DerivedWalletRecord | undefined {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isDerivedWalletRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function rememberDerivedWallet(record: DerivedWalletRecord): void {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(record));
}

/** Persists a new account count so a later sign-in restores every account. */
function setDerivedAccountCount(accountCount: number): void {
  const existing = currentDerivedWallet();
  if (existing) rememberDerivedWallet({ ...existing, accountCount });
}

function isDerivedWalletRecord(value: unknown): value is DerivedWalletRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<DerivedWalletRecord>;
  return (
    typeof record.credentialId === "string" &&
    typeof record.label === "string" &&
    typeof record.accountCount === "number"
  );
}

export type { DerivedWalletRecord };
export { currentDerivedWallet, rememberDerivedWallet, setDerivedAccountCount };
