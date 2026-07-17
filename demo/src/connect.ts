import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  createSecretVaultWithNewPasskey,
  decryptSecretVaultWithPasskey,
  type EvmAddress,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  parseSecretVault,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { BaseError as ViemError } from "viem";
import { saveCachedAccount } from "./account";
import {
  deriveEvmPrivateKey,
  isValidMnemonic,
  mnemonicToSeed,
  prfOutputToMnemonic,
} from "./hd";
import { currentPasskeyWallet, rememberPasskeyWallet } from "./passkeyWallet";

type AccountMode = "vault" | "passkey";

type Account = {
  session: Secp256k1SigningSession;
  address: EvmAddress;
};

/**
 * A connected wallet with one passkey ceremony's worth of authority over one
 * account.
 *
 * The account's key is derived at connect and the BIP-39 seed it came from
 * is zeroed before connect returns, so the wallet holds no secret beyond the
 * account's signing session. `lock()` zeroes that session's key.
 */
type ConnectedWallet = {
  mode: AccountMode;
  /** Credential to pin when re-running a ceremony for this wallet; passkey mode only, absent otherwise. */
  credentialId?: string;
  account: Account;
  lock(): void;
};

const RP_NAME = "Mera Demo";
const VAULT_KEY = "mera.demo.secretVault";
const DEFAULT_USER = "nad";

const rpId = location.hostname;

/**
 * Derives the demo's account (HD index 0) from a BIP-39 seed and zeroes the
 * seed, so no caller retains it past the derivation.
 */
function accountFromSeed(seed: Uint8Array): Account {
  try {
    // deriveEvmPrivateKey returns a fresh buffer the session takes ownership
    // of and zeroes; the `seed` itself is never handed to a session.
    const session = createSecp256k1SigningSession({
      consumePrivateKey: deriveEvmPrivateKey(seed, 0),
    });
    return { session, address: getEvmAddress(session.publicKey) };
  } finally {
    seed.fill(0);
  }
}

// ----- Passkey mode: one PRF output is the HD root of the account ------------

/**
 * Builds a passkey-mode wallet from a single PRF output.
 *
 * PRF output -> BIP-39 mnemonic -> seed -> account key; the PRF output and
 * the seed are zeroed before this returns. The mnemonic string is transient
 * and re-derivable from a fresh ceremony, which is how the export flow shows
 * it again.
 */
function buildPasskeyWallet(
  prfOutput: Uint8Array,
  credentialId: string,
): ConnectedWallet {
  const seed = mnemonicToSeed(prfOutputToMnemonic(prfOutput));
  prfOutput.fill(0);
  const account = accountFromSeed(seed);
  return {
    mode: "passkey",
    credentialId,
    account,
    lock: () => account.session.lock(),
  };
}

async function createPasskeyWallet(): Promise<ConnectedWallet> {
  // `user.id` is left to default (32 random bytes), so every "Create" is a
  // distinct, parallel passkey rather than silently overwriting an existing one.
  const credential = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: RP_NAME },
    user: { name: DEFAULT_USER, displayName: DEFAULT_USER },
  });

  rememberPasskeyWallet({
    credentialId: credential.credentialId,
    transports: credential.transports,
  });

  return buildPasskeyWallet(credential.prfOutput, credential.credentialId);
}

async function openPasskeyWallet(): Promise<ConnectedWallet> {
  // Pin to the passkey created on this device when we know it; otherwise fall
  // back to a discoverable credential so a freshly synced device still works.
  const known = currentPasskeyWallet();
  const { prfOutput, credentialId } = await getPasskeyPrfOutput({
    rpId,
    credential: known?.credentialId
      ? { credentialId: known.credentialId, transports: known.transports }
      : undefined,
  });

  // The ceremony reports which credential was actually used; keep transports
  // only when it matches the current local record.
  rememberPasskeyWallet({
    credentialId,
    transports:
      known?.credentialId === credentialId ? known?.transports : undefined,
  });

  return buildPasskeyWallet(prfOutput, credentialId);
}

// ----- Vault mode: one passkey encrypts one seed phrase the account derives from

async function createVaultAccount(mnemonic: string): Promise<ConnectedWallet> {
  const phrase = mnemonic.trim();
  if (!isValidMnemonic(phrase)) {
    throw new Error("Enter a valid recovery phrase, or generate a fresh one.");
  }

  // The phrase itself is the secret the passkey encrypts. Storing it lets
  // vault mode reveal it again later. Signing keys are re-derived from the
  // phrase on unlock, the standard HD way, so it stays portable to wallet apps
  // such as MetaMask.
  const secret = new TextEncoder().encode(phrase);
  try {
    const vault = await createSecretVaultWithNewPasskey({
      rp: { id: rpId, name: RP_NAME },
      user: { name: DEFAULT_USER, displayName: DEFAULT_USER },
      secret,
    });
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  } finally {
    // The library owns and zeroes transient PRF output. This caller-owned copy
    // of the phrase remains the demo's responsibility.
    secret.fill(0);
  }

  return vaultWalletFromPhrase(phrase);
}

async function unlockVaultAccount(): Promise<ConnectedWallet> {
  return vaultWalletFromPhrase(await decryptStoredVaultPhrase());
}

/**
 * Reads the stored secret vault and decrypts its seed phrase behind a fresh
 * passkey ceremony. Unlock and reveal share this function. The PRF output and
 * decrypted bytes are zeroed before returning, even when decryption throws.
 */
async function decryptStoredVaultPhrase(): Promise<string> {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) {
    throw new Error(
      "No vault-backed account exists on this device. Create one first.",
    );
  }

  const vault = parseSecretVault(raw);
  const secret = await decryptSecretVaultWithPasskey({ rpId, vault });
  try {
    return new TextDecoder().decode(secret);
  } finally {
    secret.fill(0);
  }
}

function vaultWalletFromPhrase(phrase: string): ConnectedWallet {
  const account = accountFromSeed(mnemonicToSeed(phrase));
  return {
    mode: "vault",
    account,
    lock: () => account.session.lock(),
  };
}

/**
 * Connects a wallet for the chosen mode and action with one passkey ceremony,
 * and caches the resulting account's public identity for the next page load.
 *
 * `secret` is the recovery phrase a vault-backed account is created from; every
 * other path (passkey, or signing back into an existing secret vault) ignores
 * it, so it is optional.
 */
async function connect(
  mode: AccountMode,
  action: "create" | "signin",
  secret?: string,
): Promise<ConnectedWallet> {
  let wallet: ConnectedWallet;
  if (mode === "vault") {
    wallet =
      action === "create"
        ? await createVaultAccount(secret ?? "")
        : await unlockVaultAccount();
  } else {
    wallet =
      action === "create"
        ? await createPasskeyWallet()
        : await openPasskeyWallet();
  }
  saveCachedAccount({ mode, address: wallet.account.address });
  return wallet;
}

/**
 * Reveals the recovery phrase behind a fresh passkey ceremony: passkey mode
 * re-derives it from the PRF output, vault mode decrypts the stored vault.
 * Transient secret bytes are zeroed; the returned string cannot be.
 */
async function revealMnemonic(
  wallet: Pick<ConnectedWallet, "mode" | "credentialId">,
): Promise<string> {
  if (wallet.mode === "vault") {
    return decryptStoredVaultPhrase();
  }

  const record = currentPasskeyWallet();
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId,
    credential: wallet.credentialId
      ? {
          credentialId: wallet.credentialId,
          transports:
            record?.credentialId === wallet.credentialId
              ? record?.transports
              : undefined,
        }
      : undefined,
  });

  try {
    return prfOutputToMnemonic(prfOutput);
  } finally {
    prfOutput.fill(0);
  }
}

/** Turns library and chain errors into short, friendly status text. */
function describeError(error: unknown): string {
  if (isMeraError(error)) {
    switch (error.code) {
      case "PRF_UNAVAILABLE":
        return "This browser or authenticator doesn't support the WebAuthn PRF extension this demo needs.";
      case "DECRYPT_FAILED":
        return "Couldn't unlock the account with that passkey.";
      case "SESSION_LOCKED":
        return "The session is locked. Connect again.";
      case "CRYPTO_UNAVAILABLE":
        return "This browser doesn't provide the Web Crypto APIs this demo needs.";
      case "PASSKEY_OPERATION_FAILED":
        return "The passkey request was cancelled or failed.";
      case "VAULT_FORMAT_INVALID":
        return "Stored vault is malformed.";
      default:
        return error.message;
    }
  }
  // A viem error's `message` appends the request URL, body, and hex payload;
  // `shortMessage` is its one-line summary, e.g. "Transaction creation failed."
  if (error instanceof ViemError) return error.shortMessage;
  return error instanceof Error ? error.message : String(error);
}

export type { Account, AccountMode, ConnectedWallet };
export { connect, describeError, revealMnemonic };
