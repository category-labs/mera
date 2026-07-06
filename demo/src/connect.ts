import {
  createEd25519SigningSession,
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  createSecretVault,
  type Ed25519SigningSession,
  type EvmAddress,
  getDeterministicPrfSaltV1,
  getEvmAddress,
  getPasskeyPrfOutput,
  getSecretVaultPrfOutput,
  getSolanaAddress,
  isMeraError,
  parseSecretVault,
  type Secp256k1SigningSession,
  unwrapSecretVault,
} from "@category-labs/mera";
import { currentDerivedWallet, rememberDerivedWallet } from "./derivedWallet";
import {
  deriveEthereumPrivateKey,
  deriveSolanaSeed,
  isValidMnemonic,
  mnemonicToSeed,
  prfOutputToMnemonic,
} from "./hd";

/** The two account modes the demo offers (mera itself is mode-agnostic). */
type AccountMode = "wrapped" | "derived";

/** One numbered account: a passkey-derived signing session per chain. */
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
 * A connected wallet — one passkey ceremony's worth of authority.
 *
 * Derived mode holds the BIP-39 master seed for the session and can mint more
 * numbered HD accounts with no further passkey prompt. Wrapped mode exposes the
 * single decrypted account from its vault. Either way, `lock()` zeroes every
 * secret the wallet still holds.
 */
type ConnectedWallet = {
  mode: AccountMode;
  /** Credential to pin when re-running a ceremony for this wallet; derived mode only, absent otherwise. */
  credentialId?: string;
  /** Returns the account at `index`, deriving and caching it on first use. */
  deriveAccount(index: number): AccountSlot;
  /** Zeroes the master seed and every signing session handed out. */
  lock(): void;
};

/** Result of a connect call: the wallet plus how many accounts to materialize. */
type ConnectResult = { wallet: ConnectedWallet; accountCount: number };

const RP_NAME = "Mera Demo";
const VAULT_KEY = "mera.demo.accountVault";
const DEFAULT_USER = "nad";

const rpId = location.hostname;

/** Derives both chain sessions for one HD account index from the master seed. */
function deriveSlotFromSeed(seed: Uint8Array, index: number): AccountSlot {
  // Each derive* call returns a fresh buffer the session takes ownership of and
  // zeroes; the master `seed` itself is never handed to a session.
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

// ----- Derived mode: one PRF output is the HD master for every account -------

/**
 * Builds a derived-mode wallet from a single PRF output.
 *
 * The PRF output becomes a BIP-39 master seed held in memory for the session,
 * exactly like the signing keys are — and zeroed alongside them on `lock()`.
 * Holding it is what lets "Add account" derive a new HD account instantly with
 * no extra biometric: one ceremony per session, not per account.
 */
function buildDerivedWallet(
  prfOutput: Uint8Array,
  credentialId: string,
): ConnectedWallet {
  // PRF output -> BIP-39 mnemonic -> 64-byte master seed. The mnemonic string
  // is transient (re-derivable from a fresh ceremony for a future export flow);
  // only the zeroable seed bytes are retained.
  let seed: Uint8Array | undefined = mnemonicToSeed(
    prfOutputToMnemonic(prfOutput),
  );
  prfOutput.fill(0);

  const cache = new Map<number, AccountSlot>();

  return {
    mode: "derived",
    credentialId,
    deriveAccount(index): AccountSlot {
      const cached = cache.get(index);
      if (cached) return cached;
      if (!seed) throw new Error("Wallet is locked — connect again.");
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

async function createDerived(label: string): Promise<ConnectResult> {
  // `user.id` is left to default (32 random bytes), so every "Create" is a
  // distinct, parallel passkey rather than silently overwriting an existing one.
  const prfSalt = getDeterministicPrfSaltV1();
  const credential = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: RP_NAME },
    user: { name: label, displayName: label },
    prfSalt,
  });

  rememberDerivedWallet({
    credentialId: credential.credentialId,
    transports: credential.transports,
    label,
    accountCount: 1,
  });

  const wallet = buildDerivedWallet(
    credential.prfOutput,
    credential.credentialId,
  );
  return { wallet, accountCount: 1 };
}

async function openDerived(): Promise<ConnectResult> {
  // Pin to the passkey created on this device when we know it; otherwise fall
  // back to a discoverable credential so a freshly synced device still works.
  const known = currentDerivedWallet();
  const prfSalt = getDeterministicPrfSaltV1();
  const { prfOutput, credentialId } = await getPasskeyPrfOutput({
    rpId,
    credential: known?.credentialId
      ? { credentialId: known.credentialId, transports: known.transports }
      : undefined,
    prfSalt,
  });

  // The ceremony reports which credential was actually used; if it matches the
  // current local record, restore that wallet's account count.
  const record = known?.credentialId === credentialId ? known : undefined;
  const label = record?.label ?? DEFAULT_USER;
  const accountCount = record?.accountCount ?? 1;
  rememberDerivedWallet({
    credentialId,
    transports: record?.transports,
    label,
    accountCount,
  });

  const wallet = buildDerivedWallet(prfOutput, credentialId);
  return { wallet, accountCount };
}

// ----- Wrapped mode: one passkey encrypts one seed phrase; both chains derive from it

async function createWrapped(
  label: string,
  mnemonic: string,
): Promise<ConnectResult> {
  const phrase = mnemonic.trim();
  if (!isValidMnemonic(phrase)) {
    throw new Error("Enter a valid recovery phrase, or generate a fresh one.");
  }

  const credential = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: RP_NAME },
    user: { name: label, displayName: label },
    prfSalt: crypto.getRandomValues(new Uint8Array(32)),
  });

  // The phrase itself is the secret the passkey encrypts. Storing the phrase —
  // not the derived keys — is what lets wrapped mode reveal it again later;
  // signing keys are re-derived from it on unlock, the standard HD way, so it
  // stays portable to MetaMask / Phantom.
  const secret = new TextEncoder().encode(phrase);
  try {
    const vault = await createSecretVault({ credential, secret });
    localStorage.setItem(VAULT_KEY, JSON.stringify(vault));
  } finally {
    // Zero the transient secret and PRF output whether or not wrapping
    // succeeded; the wallet is rebuilt from `phrase`, not from these.
    secret.fill(0);
    credential.prfOutput.fill(0);
  }

  return {
    wallet: buildWrappedWallet(wrappedSlotFromPhrase(phrase)),
    accountCount: 1,
  };
}

async function unlockWrapped(): Promise<ConnectResult> {
  const phrase = await decryptStoredWrappedPhrase();
  return {
    wallet: buildWrappedWallet(wrappedSlotFromPhrase(phrase)),
    accountCount: 1,
  };
}

/**
 * Reads the stored wrapped vault and decrypts its seed phrase behind a fresh
 * passkey ceremony. Shared by unlock and reveal; the PRF output and decrypted
 * bytes are zeroed before returning, even when the decrypt itself throws.
 */
async function decryptStoredWrappedPhrase(): Promise<string> {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) {
    throw new Error(
      "No wrapped account on this device yet — create one first.",
    );
  }

  const vault = parseSecretVault(raw);
  const { prfOutput } = await getSecretVaultPrfOutput({ rpId, vault });
  try {
    const secret = await unwrapSecretVault({ vault, prfOutput });
    try {
      return new TextDecoder().decode(secret);
    } finally {
      secret.fill(0);
    }
  } finally {
    prfOutput.fill(0);
  }
}

/** Derives the single wrapped-mode account (index 0) from its seed phrase. */
function wrappedSlotFromPhrase(phrase: string): AccountSlot {
  const seed = mnemonicToSeed(phrase);
  try {
    return deriveSlotFromSeed(seed, 0);
  } finally {
    seed.fill(0);
  }
}

/** Builds a wrapped-mode wallet around its single decrypted account. */
function buildWrappedWallet(slot: AccountSlot): ConnectedWallet {
  return {
    mode: "wrapped",
    deriveAccount(index): AccountSlot {
      if (index !== 0) throw new Error("Wrapped mode has a single account.");
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
 * One passkey ceremony unlocks the wallet; in derived mode every numbered
 * account afterwards is pure HD math with no further prompt.
 *
 * `secret` is the recovery phrase a wrapped account is created from; every other
 * path (derived, or signing back into an existing wrapped vault) ignores it, so
 * it is optional.
 */
function connect(
  mode: AccountMode,
  action: "create" | "signin",
  username: string,
  secret?: string,
): Promise<ConnectResult> {
  const label = username.trim() || DEFAULT_USER;
  if (mode === "wrapped") {
    return action === "create"
      ? createWrapped(label, secret ?? "")
      : unlockWrapped();
  }
  return action === "create" ? createDerived(label) : openDerived();
}

/**
 * Reveals a wallet's BIP-39 recovery phrase behind a fresh passkey ceremony.
 *
 * Derived wallets re-derive the phrase from the passkey PRF output; wrapped
 * wallets decrypt the phrase the user generated or imported out of the secret
 * vault. Either way the mnemonic is fetched on demand behind a fresh biometric.
 * PRF output and decrypted secret bytes are zeroed where possible before the
 * function returns. The phrase is returned as a JavaScript string, which cannot
 * be zeroed in place.
 */
async function revealMnemonic(wallet: ConnectedWallet): Promise<string> {
  if (wallet.mode === "wrapped") {
    return decryptStoredWrappedPhrase();
  }

  const record = currentDerivedWallet();
  const prfSalt = getDeterministicPrfSaltV1();
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
    prfSalt,
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
        return "Your session is locked — connect again.";
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
