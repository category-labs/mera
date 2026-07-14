import type { PasskeyCredentialTransport } from "@category-labs/mera";

/**
 * Non-secret metadata for a passkey wallet created on this device.
 *
 * It holds no key material. The app uses it to pin the right passkey with
 * `allowCredentials` on the next same-device sign-in instead of showing every
 * discoverable credential, and to remember how many HD accounts the current
 * wallet had derived so sign-in can restore them. A fresh device has no record
 * and falls back to a discoverable sign-in.
 */
type PasskeyWalletRecord = {
  credentialId: string;
  transports?: readonly PasskeyCredentialTransport[];
  label: string;
  accountCount: number;
};

const STORAGE_KEY = "mera.demo.passkeyWallet";

function currentPasskeyWallet(): PasskeyWalletRecord | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isPasskeyWalletRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function rememberPasskeyWallet(record: PasskeyWalletRecord): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

/** Persists a new account count so a later sign-in restores every account. */
function setPasskeyAccountCount(accountCount: number): void {
  const existing = currentPasskeyWallet();
  if (existing) rememberPasskeyWallet({ ...existing, accountCount });
}

function isPasskeyWalletRecord(value: unknown): value is PasskeyWalletRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<PasskeyWalletRecord>;
  return (
    typeof record.credentialId === "string" &&
    typeof record.label === "string" &&
    typeof record.accountCount === "number"
  );
}

export { currentPasskeyWallet, rememberPasskeyWallet, setPasskeyAccountCount };
