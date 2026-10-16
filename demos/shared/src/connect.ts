import {
  createSecretVaultWithNewPasskey,
  decryptSecretVaultWithPasskey,
  type PasskeyCredentialMetadata,
  parseSecretVault,
} from "@category-labs/mera";
import { saveCachedAccount } from "./account";
import {
  type EvmAccount,
  evmAccountFromMnemonic,
  isValidMnemonic,
  prfOutputToMnemonic,
} from "./hd";
import {
  createPasskeyPrf,
  getPasskeyPrf,
  newPasskeyOptions,
  type PasskeyPrf,
} from "./passkey";

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
    ...evmAccountFromMnemonic(prfOutputToMnemonic(prfOutput)),
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
  phrase = "",
): Promise<ConnectedWallet> {
  const wallet: ConnectedWallet =
    mode === "passkey"
      ? walletFromPrf(
          action === "create"
            ? await createPasskeyPrf(rpId)
            : await getPasskeyPrf(rpId),
        )
      : {
          mode,
          ...evmAccountFromMnemonic(
            action === "create"
              ? await createVault(phrase)
              : await decryptStoredVault(),
          ),
        };
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
  return wallet;
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
  const secret = new TextEncoder().encode(trimmed);
  try {
    const vault = await createSecretVaultWithNewPasskey({
      ...newPasskeyOptions(rpId),
      secret,
    });
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
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
      "No vault-backed account exists on this device. Create one first.",
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
  if (mode === "vault") return decryptStoredVault();
  const { prfOutput } = await getPasskeyPrf(rpId, credential);
  return prfOutputToMnemonic(prfOutput);
}

export type { AccountMode, ConnectedWallet };
export { connect, revealMnemonic, walletFromPrf };
