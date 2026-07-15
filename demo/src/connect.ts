import {
  createEd25519SigningSession,
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  createSecretVaultWithNewPasskey,
  decryptSecretVaultWithPasskey,
  type Ed25519SigningSession,
  type EvmAddress,
  getEvmAddress,
  getPasskeyPrfOutput,
  getSolanaAddress,
  isMeraError,
  parseSecretVault,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import {
  deriveEthereumPrivateKey,
  deriveSolanaSeed,
  isValidMnemonic,
  mnemonicToSeed,
  prfOutputToMnemonic,
} from "./hd";
import { currentPasskeyWallet, rememberPasskeyWallet } from "./passkeyWallet";

/** The two account modes the demo offers. */
type AccountMode = "vault" | "passkey";

/** One numbered account with a signing session per chain. */
type AccountSlot = {
  index: number;
  ethereum: {
    session: Secp256k1SigningSession;
    address: EvmAddress;
  };
  solana: {
    session: Ed25519SigningSession;
    address: string;
  };
};

/**
 * A connected wallet with one passkey ceremony's worth of authority.
 *
 * Passkey mode holds the BIP-39 seed for the session and can mint more
 * numbered HD accounts with no further passkey prompt. Vault mode exposes the
 * single decrypted account from its vault. Either way, `lock()` zeroes every
 * secret the wallet still holds.
 */
type ConnectedWallet = {
  mode: AccountMode;
  /** Credential to pin when re-running a ceremony for this wallet; passkey mode only, absent otherwise. */
  credentialId?: string;
  /** Returns the account at `index`, deriving and caching it on first use. */
  deriveAccount(index: number): AccountSlot;
  /** Zeroes the seed and every signing session handed out. */
  lock(): void;
};

/** Result of a connect call: the wallet plus how many accounts to materialize. */
type ConnectResult = { wallet: ConnectedWallet; accountCount: number };

const RP_NAME = "Mera Demo";
const VAULT_KEY = "mera.demo.secretVault";
const DEFAULT_USER = "nad";

const rpId = location.hostname;

/** Derives both chain sessions for one HD account index from the seed. */
function deriveSlotFromSeed(seed: Uint8Array, index: number): AccountSlot {
  // Each derive* call returns a fresh buffer the session takes ownership of and
  // zeroes; the `seed` itself is never handed to a session.
  const secpSession = createSecp256k1SigningSession({
    consumePrivateKey: deriveEthereumPrivateKey(seed, index),
  });
  const ed25519Session = createEd25519SigningSession({
    consumePrivateKey: deriveSolanaSeed(seed, index),
  });
  return {
    index,
    ethereum: {
      session: secpSession,
      address: getEvmAddress(secpSession.publicKey),
    },
    solana: {
      session: ed25519Session,
      address: getSolanaAddress(ed25519Session.publicKey),
    },
  };
}

// ----- Passkey mode: one PRF output is the HD root for every account ---------

/**
 * Builds a passkey-mode wallet from a single PRF output.
 *
 * The PRF output becomes a BIP-39 seed held in memory for the session,
 * exactly like the signing keys are, and is zeroed alongside them on `lock()`.
 * Holding it lets "Add account" derive a new HD account without another
 * ceremony. The demo runs one ceremony per session rather than per account.
 */
function buildPasskeyWallet(
  prfOutput: Uint8Array,
  credentialId: string,
): ConnectedWallet {
  // PRF output -> BIP-39 mnemonic -> 64-byte seed. The mnemonic string
  // is transient (re-derivable from a fresh ceremony for a future export flow);
  // only the zeroable seed bytes are retained.
  let seed: Uint8Array | undefined = mnemonicToSeed(
    prfOutputToMnemonic(prfOutput),
  );
  prfOutput.fill(0);

  const cache = new Map<number, AccountSlot>();

  return {
    mode: "passkey",
    credentialId,
    deriveAccount(index): AccountSlot {
      const cached = cache.get(index);
      if (cached) return cached;
      if (!seed) throw new Error("The wallet is locked. Connect again.");
      const slot = deriveSlotFromSeed(seed, index);
      cache.set(index, slot);
      return slot;
    },
    lock(): void {
      for (const slot of cache.values()) {
        slot.ethereum.session.lock();
        slot.solana.session.lock();
      }
      cache.clear();
      if (seed) {
        seed.fill(0);
        seed = undefined;
      }
    },
  };
}

async function createPasskeyWallet(label: string): Promise<ConnectResult> {
  // `user.id` is left to default (32 random bytes), so every "Create" is a
  // distinct, parallel passkey rather than silently overwriting an existing one.
  const credential = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: RP_NAME },
    user: { name: label, displayName: label },
  });

  rememberPasskeyWallet({
    credentialId: credential.credentialId,
    transports: credential.transports,
    label,
    accountCount: 1,
  });

  const wallet = buildPasskeyWallet(
    credential.prfOutput,
    credential.credentialId,
  );
  return { wallet, accountCount: 1 };
}

async function openPasskeyWallet(): Promise<ConnectResult> {
  // Pin to the passkey created on this device when we know it; otherwise fall
  // back to a discoverable credential so a freshly synced device still works.
  const known = currentPasskeyWallet();
  const { prfOutput, credentialId } = await getPasskeyPrfOutput({
    rpId,
    credential: known?.credentialId
      ? { credentialId: known.credentialId, transports: known.transports }
      : undefined,
  });

  // The ceremony reports which credential was actually used; if it matches the
  // current local record, restore that wallet's account count.
  const record = known?.credentialId === credentialId ? known : undefined;
  const label = record?.label ?? DEFAULT_USER;
  const accountCount = record?.accountCount ?? 1;
  rememberPasskeyWallet({
    credentialId,
    transports: record?.transports,
    label,
    accountCount,
  });

  const wallet = buildPasskeyWallet(prfOutput, credentialId);
  return { wallet, accountCount };
}

// ----- Vault mode: one passkey encrypts one seed phrase; both chains derive from it

async function createVaultAccount(
  label: string,
  mnemonic: string,
): Promise<ConnectResult> {
  const phrase = mnemonic.trim();
  if (!isValidMnemonic(phrase)) {
    throw new Error("Enter a valid recovery phrase, or generate a fresh one.");
  }

  // The phrase itself is the secret the passkey encrypts. Storing it lets
  // vault mode reveal it again later. Signing keys are re-derived from the
  // phrase on unlock, the standard HD way, so it stays portable to wallet apps
  // such as MetaMask and Phantom.
  const secret = new TextEncoder().encode(phrase);
  try {
    const vault = await createSecretVaultWithNewPasskey({
      rp: { id: rpId, name: RP_NAME },
      user: { name: label, displayName: label },
      secret,
    });
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  } finally {
    // The library owns and zeroes transient PRF output. This caller-owned copy
    // of the phrase remains the demo's responsibility.
    secret.fill(0);
  }

  return {
    wallet: buildVaultWallet(vaultSlotFromPhrase(phrase)),
    accountCount: 1,
  };
}

async function unlockVaultAccount(): Promise<ConnectResult> {
  const phrase = await decryptStoredVaultPhrase();
  return {
    wallet: buildVaultWallet(vaultSlotFromPhrase(phrase)),
    accountCount: 1,
  };
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

/** Derives the single vault-mode account (index 0) from its seed phrase. */
function vaultSlotFromPhrase(phrase: string): AccountSlot {
  const seed = mnemonicToSeed(phrase);
  try {
    return deriveSlotFromSeed(seed, 0);
  } finally {
    seed.fill(0);
  }
}

/** Builds a vault-mode wallet around its single decrypted account. */
function buildVaultWallet(slot: AccountSlot): ConnectedWallet {
  return {
    mode: "vault",
    deriveAccount(index): AccountSlot {
      if (index !== 0) throw new Error("Vault mode has a single account.");
      return slot;
    },
    lock(): void {
      slot.ethereum.session.lock();
      slot.solana.session.lock();
    },
  };
}

/**
 * Connects a wallet for the chosen mode and action.
 *
 * One passkey ceremony unlocks the wallet; in passkey mode every numbered
 * account afterwards is pure HD math with no further prompt.
 *
 * `secret` is the recovery phrase a vault-backed account is created from; every
 * other path (passkey, or signing back into an existing secret vault) ignores
 * it, so it is optional.
 */
function connect(
  mode: AccountMode,
  action: "create" | "signin",
  username: string,
  secret?: string,
): Promise<ConnectResult> {
  const label = username.trim() || DEFAULT_USER;
  if (mode === "vault") {
    return action === "create"
      ? createVaultAccount(label, secret ?? "")
      : unlockVaultAccount();
  }
  return action === "create" ? createPasskeyWallet(label) : openPasskeyWallet();
}

/**
 * Reveals a wallet's BIP-39 recovery phrase behind a fresh passkey ceremony.
 *
 * Passkey wallets re-derive the phrase from the passkey PRF output; vault-backed
 * wallets decrypt the generated or imported phrase from the secret vault.
 * Either way, the mnemonic is fetched on demand after fresh user verification.
 * PRF output and decrypted secret bytes are zeroed where possible before the
 * function returns. The phrase is returned as a JavaScript string, which cannot
 * be zeroed in place.
 */
async function revealMnemonic(wallet: ConnectedWallet): Promise<string> {
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
  return error instanceof Error ? error.message : String(error);
}

export type { AccountMode, AccountSlot, ConnectedWallet, ConnectResult };
export { connect, DEFAULT_USER, describeError, revealMnemonic };
