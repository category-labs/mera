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
  localStorage.removeItem(STORAGE_KEY);
}

function isCachedAccount(value: unknown): value is CachedAccount {
  const { mode, address, credential } = (value ?? {}) as Record<
    string,
    unknown
  >;
  return (
    typeof address === "string" &&
    isAddress(address, { strict: false }) &&
    // Passkey mode needs the credential: an unpinned reveal offers every
    // passkey and can show another account's phrase.
    (mode === "vault" || (mode === "passkey" && isCredential(credential)))
  );
}

function isCredential(value: unknown): value is PasskeyCredentialMetadata {
  const { credentialId, transports } = (value ?? {}) as Record<string, unknown>;
  return (
    typeof credentialId === "string" &&
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
  saveCachedAccount,
};
