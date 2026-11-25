import type {
  EvmAddress,
  PasskeyCredentialMetadata,
} from "@category-labs/mera";
import { isAddress } from "viem";
import type { AccountMode, ConnectedWallet } from "./connect";

/**
 * The account behind the trading surface. "locked" is a reloaded page: the
 * cached public identity shows the portfolio, and the first trade runs a
 * passkey ceremony to restore the signing session.
 */
type AccountState =
  | { status: "none" }
  | ({ status: "locked" } & CachedAccount)
  | { status: "unlocked"; wallet: ConnectedWallet };

/**
 * The signed-in account's public identity, cached so a reload can show its
 * portfolio without a passkey ceremony. Holds no key material.
 */
type CachedAccount = {
  mode: AccountMode;
  address: EvmAddress;
  /** Credential the recovery-phrase reveal pins; passkey mode only. */
  credential?: PasskeyCredentialMetadata;
};

const STORAGE_KEY = "mera.demo.account";
const CREDENTIAL_KEY = "mera.demo.credential";

function accountAddress(account: AccountState): EvmAddress | null {
  switch (account.status) {
    case "none":
      return null;
    case "locked":
      return account.address;
    case "unlocked":
      return account.wallet.address;
  }
}

function loadCachedAccount(): CachedAccount | undefined {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "null",
    );
    return isCachedAccount(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function saveCachedAccount(account: CachedAccount): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
}

function clearCachedAccount(): void {
  if (loadKnownCredential() === undefined) {
    const cached = loadCachedAccount();
    if (cached?.credential !== undefined) {
      saveKnownCredential(cached.credential);
    }
  }
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * The remembered passkey credential, kept across sign-outs so creating a new
 * passkey can exclude it while it still exists on the authenticator. Holds no
 * key material.
 */
function loadKnownCredential(): PasskeyCredentialMetadata | undefined {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(CREDENTIAL_KEY) ?? "null",
    );
    return isCredential(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Remembers `credential` for future passkey creation. Preserves stored
 * transports when a sign-in returns the same credential ID without them.
 */
function saveKnownCredential(credential: PasskeyCredentialMetadata): void {
  try {
    const existing = loadKnownCredential();
    const merged: PasskeyCredentialMetadata =
      existing !== undefined &&
      existing.credentialId === credential.credentialId &&
      credential.transports === undefined
        ? existing
        : credential;
    localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(merged));
  } catch {
    // Unavailable storage leaves the credential unremembered.
  }
}

function isCachedAccount(value: unknown): value is CachedAccount {
  if (
    typeof value !== "object" ||
    value === null ||
    !("mode" in value) ||
    !("address" in value)
  ) {
    return false;
  }
  const { mode, address } = value;
  return (
    typeof address === "string" &&
    isAddress(address, { strict: false }) &&
    // Passkey mode needs the credential: an unpinned reveal offers every
    // passkey and can show another account's phrase.
    (mode === "vault" ||
      (mode === "passkey" &&
        "credential" in value &&
        isCredential(value.credential)))
  );
}

function isCredential(value: unknown): value is PasskeyCredentialMetadata {
  if (
    typeof value !== "object" ||
    value === null ||
    !("credentialId" in value)
  ) {
    return false;
  }
  const { credentialId } = value;
  const transports = "transports" in value ? value.transports : undefined;
  return (
    typeof credentialId === "string" &&
    credentialId.length > 0 &&
    (transports === undefined ||
      (Array.isArray(transports) &&
        transports.every((transport) => typeof transport === "string")))
  );
}

export type { AccountState, CachedAccount };
export {
  accountAddress,
  clearCachedAccount,
  loadCachedAccount,
  loadKnownCredential,
  saveCachedAccount,
  saveKnownCredential,
};
