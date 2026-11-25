import type { PasskeyCredentialMetadata } from "@category-labs/mera";
import {
  createSecretVaultWithNewPasskey,
  decryptSecretVaultWithPasskey,
  MeraError,
  parseSecretVault,
} from "@category-labs/mera";
import {
  loadKnownCredential,
  saveCachedAccount,
  saveKnownCredential,
} from "./account";
import type { EvmAccount } from "./hd";
import {
  evmAccountFromMnemonic,
  evmAccountFromPrfOutput,
  isValidMnemonic,
  prfOutputToMnemonic,
} from "./hd";
import type { PasskeyPrf } from "./passkey";
import { createPasskeyPrf, getPasskeyPrf, newPasskeyOptions } from "./passkey";

type AccountMode = "vault" | "passkey";

/**
 * One account and its signing session, held until signing out. Passkey mode
 * keeps the credential so a later ceremony can pin it.
 */
type ConnectedWallet = EvmAccount & {
  mode: AccountMode;
  credential?: PasskeyCredentialMetadata;
};

const VAULT_KEY = "mera.demo.secretVault";

const rpId = location.hostname;

/** The passkey-mode wallet for a ceremony's result. Zeroes the PRF output. */
function walletFromPrf({ prfOutput, credential }: PasskeyPrf): ConnectedWallet {
  return {
    mode: "passkey",
    credential,
    ...evmAccountFromPrfOutput(prfOutput),
  };
}

/**
 * Connects a wallet with one passkey ceremony and caches the account's public
 * identity for the next page load. Passkey mode creates a passkey or signs in
 * with any passkey for this site. Vault mode encrypts `phrase` under a new
 * passkey, or decrypts the stored vault.
 */
async function connect(
  mode: AccountMode,
  action: "create" | "signin",
  phrase = ""
): Promise<ConnectedWallet> {
  const known =
    mode === "passkey" && action === "create"
      ? loadKnownCredential()
      : undefined;
  const wallet: ConnectedWallet =
    mode === "passkey"
      ? walletFromPrf(
          action === "create"
            ? await createPasskeyPrf(rpId, known ? [known] : undefined).catch(
                rememberCreatedCredential
              )
            : await getPasskeyPrf(rpId).catch(explainIncompleteSignIn)
        )
      : {
          mode,
          ...evmAccountFromMnemonic(
            action === "create"
              ? await createVault(phrase)
              : await decryptStoredVault()
          ),
        };
  if (action === "create" && wallet.credential !== undefined) {
    saveKnownCredential(wallet.credential);
  }
  try {
    saveCachedAccount({
      mode,
      address: wallet.address,
      credential: wallet.credential,
    });
  } catch (error) {
    wallet.session.end();
    throw error;
  }
  if (action === "signin" && wallet.credential !== undefined) {
    saveKnownCredential(wallet.credential);
  }
  return wallet;
}

/**
 * Adds a hint to an incomplete sign-in. Browsers report a dismissed prompt, a
 * timeout, and no matching passkey alike, so the passkey may still exist on
 * another device.
 */
function explainIncompleteSignIn(error: unknown): never {
  if (error instanceof MeraError && error.code === "PASSKEY_CANCELLED") {
    throw new Error(
      "Passkey sign-in didn't complete. Try again, or use a passkey from another device.",
      { cause: error }
    );
  }
  throw error;
}

/**
 * Remembers the passkey a failed creation left on the authenticator, so the
 * next creation excludes it, then rethrows.
 */
function rememberCreatedCredential(error: unknown): never {
  if (error instanceof MeraError && error.credential !== undefined) {
    saveKnownCredential(error.credential);
  }
  throw error;
}

function loadVaultCredential(): PasskeyCredentialMetadata | undefined {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    return raw === null ? undefined : parseSecretVault(raw).credential;
  } catch {
    return undefined;
  }
}

/**
 * Encrypts the phrase under a new passkey and stores the vault. The phrase
 * itself is the secret, so vault mode can reveal it again, and the account
 * derives from it the standard HD way, so it stays portable to wallet apps.
 */
async function createVault(phrase: string): Promise<string> {
  const trimmed = phrase.trim();
  if (!isValidMnemonic(trimmed)) {
    throw new Error("Enter a valid recovery phrase, or generate a fresh one.");
  }
  const existing = loadVaultCredential();
  const secret = new TextEncoder().encode(trimmed);
  try {
    const vault = await createSecretVaultWithNewPasskey({
      ...newPasskeyOptions(rpId),
      excludeCredentials: existing ? [existing] : undefined,
      secret,
    });
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  } catch (error) {
    if (error instanceof MeraError && error.code === "PASSKEY_EXISTS") {
      throw new Error(
        "The saved vault's passkey already exists. Sign in to open the saved vault's account.",
        { cause: error }
      );
    }
    throw error;
  } finally {
    secret.fill(0);
  }
  return trimmed;
}

/**
 * Decrypts the stored vault's phrase behind a fresh passkey ceremony. The
 * decrypted bytes are zeroed; the returned string cannot be.
 */
async function decryptStoredVault(): Promise<string> {
  const raw = localStorage.getItem(VAULT_KEY);
  if (raw === null) {
    throw new Error(
      "No vault-backed account exists on this device. Create a vault first."
    );
  }
  const secret = await decryptSecretVaultWithPasskey({
    rpId,
    vault: parseSecretVault(raw),
  });
  try {
    return new TextDecoder().decode(secret);
  } finally {
    secret.fill(0);
  }
}

/**
 * Reveals the recovery phrase behind a fresh passkey ceremony: passkey mode
 * re-derives it from the PRF output, vault mode decrypts the stored vault.
 */
async function revealMnemonic({
  mode,
  credential,
}: Pick<ConnectedWallet, "mode" | "credential">): Promise<string> {
  if (mode === "vault") {
    return decryptStoredVault();
  }
  const { prfOutput } = await getPasskeyPrf(rpId, credential);
  return prfOutputToMnemonic(prfOutput);
}

export type { AccountMode, ConnectedWallet };
export { connect, revealMnemonic, walletFromPrf };
