import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  type EvmAddress,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyPrfResult,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import type { PasskeyError } from "react-native-passkey";
import { rpId } from "./config";
import { deriveEvmPrivateKey, mnemonicToSeed, prfOutputToMnemonic } from "./hd";
import { nativePasskeyClient } from "./passkeyClient";
import { cachePrfResult, readCachedPrfResult } from "./prfCache";

// The relying party name and user name the web demo passes, repeated here so
// both apps label their passkeys alike. Neither reaches the PRF, so neither can
// move an address.
const RP_NAME = "mera demo";
const USER_NAME = "nad";

// Every create adds a passkey, so the label carries the creation time to keep
// the entries apart. Android shows it; iOS does not, because
// react-native-passkey's platform registration request takes only `name`.
const accountLabel = (): string => `Account ${new Date().toLocaleString()}`;

/**
 * Authority over one account for as long as the session lives. `lock` ends the
 * signing session, zeroing its key. `source` names where the PRF output came
 * from: a passkey ceremony, or this device's cache.
 */
type PasskeyWallet = {
  address: EvmAddress;
  credentialId: string;
  session: Secp256k1SigningSession;
  source: "passkey" | "cache";
  lock(): void;
};

/**
 * Creates a passkey for {@link rpId} and derives its account. The web demo
 * reaches the same account from the same passkey: the address is a function of
 * the credential, the relying party, and the salt, and both apps agree on all
 * three.
 *
 * mera draws a fresh user handle per call and this passes no excluded
 * credentials, so every call adds a passkey and an account rather than replacing
 * one, which is what the web demo does as well. The cache holds one result, so
 * creating again repoints it at the newest account.
 *
 * One prompt where the authenticator evaluates PRF while it writes the
 * credential, which is what iOS 18 does. One that enables PRF without returning
 * an output makes mera assert the new passkey for one, showing a second prompt.
 */
async function createAccount(): Promise<PasskeyWallet> {
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: RP_NAME },
    user: { name: USER_NAME, displayName: accountLabel() },
    webAuthnClient: nativePasskeyClient,
  });
  // Cached before toWallet, which zeroes prfOutput.
  await cachePrfResult(created);

  return toWallet(created, "passkey");
}

/**
 * Signs in from the device cache when it holds a PRF output, and from a passkey
 * ceremony for {@link rpId} when it does not, caching what the ceremony returns.
 *
 * The ceremony path stays the source of truth: clearing the cache, enrolling a
 * new fingerprint, or picking up another phone falls back to it and reaches the
 * same address, because the address is a function of the passkey.
 *
 * The ceremony pins no credential, so the platform offers every discoverable
 * passkey it holds for the host, which is what a first run on a new device
 * needs.
 */
async function signIn(): Promise<PasskeyWallet> {
  const cached = await readCachedPrfResult();

  if (cached !== undefined) {
    return toWallet(cached, "cache");
  }

  const asserted = await getPasskeyPrfOutput({
    rpId,
    webAuthnClient: nativePasskeyClient,
  });
  await cachePrfResult(asserted);

  return toWallet(asserted, "passkey");
}

/**
 * Derives the account the web demo derives from the same passkey: BIP-39
 * mnemonic, then seed, then account key. The PRF output, the seed, and the
 * derived key are zeroed before this returns; the session signs from its own
 * copy. BIP-32 leaves a key on each node along the path and hands back no way
 * to reach them, so those stay until they are collected.
 */
function toWallet(
  { credentialId, prfOutput }: PasskeyPrfResult,
  source: PasskeyWallet["source"],
): PasskeyWallet {
  const seed = mnemonicToSeed(prfOutputToMnemonic(prfOutput));
  prfOutput.fill(0);
  // The session copies what it is given, so this array is the demo's to clear.
  let privateKey: Uint8Array | undefined;

  try {
    privateKey = deriveEvmPrivateKey(seed, 0);
    const session = createSecp256k1SigningSession({ privateKey });

    return {
      address: getEvmAddress(session.publicKey),
      credentialId,
      session,
      source,
      lock: () => session.end(),
    };
  } finally {
    seed.fill(0);
    privateKey?.fill(0);
  }
}

/**
 * Signs `message` as EIP-191 personal data through mera's viem account. Signing
 * reads the session key, so it shows no passkey prompt.
 */
async function signMessage(
  wallet: PasskeyWallet,
  message: string,
): Promise<`0x${string}`> {
  return toViemAccount(wallet.session).signMessage({ message });
}

/**
 * Re-derives the account's recovery phrase behind a fresh passkey ceremony,
 * pinned to the credential that signed in. The PRF output is zeroed; the
 * returned string cannot be.
 *
 * This reads no cache on purpose. Handing over the phrase that reproduces every
 * account is worth the passkey, even on a device that has already unlocked one.
 */
async function revealMnemonic(wallet: PasskeyWallet): Promise<string> {
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId,
    credential: { credentialId: wallet.credentialId },
    webAuthnClient: nativePasskeyClient,
  });

  try {
    return prfOutputToMnemonic(prfOutput);
  } finally {
    prfOutput.fill(0);
  }
}

/** Turns library and platform errors into short status text. */
function describeError(error: unknown): string {
  if (isMeraError(error)) {
    switch (error.code) {
      case "PRF_UNAVAILABLE":
        return "This passkey provider does not support the WebAuthn PRF extension. iOS needs 18 or newer; on Android, Google Password Manager and 1Password both supply it.";
      case "PASSKEY_OPERATION_FAILED":
        return describePasskeyFailure(error.cause);
      case "CRYPTO_UNAVAILABLE":
        return "The runtime provides no CSPRNG.";
      default:
        return error.message;
    }
  }

  return error instanceof Error ? error.message : String(error);
}

/**
 * Names the failure behind `PASSKEY_OPERATION_FAILED`, which mera throws with
 * whatever the WebAuthn client rejected with as its cause.
 *
 * react-native-passkey rejects with a plain object rather than an `Error`, so the
 * code arrives as `error` and its own account of the failure as `message`. That
 * account reads well for most codes, which is why the last line shows it; the two
 * named here are the ones it gets wrong.
 */
function describePasskeyFailure(cause: unknown): string {
  const { error, message } = (cause ?? {}) as Partial<PasskeyError>;

  switch (error) {
    // Both platforms report a refused association check this way, and
    // react-native-passkey replaces what they said about it, iOS's "not
    // associated with domain" included, with a line about missing credentials
    // that sends the reader hunting for a passkey instead.
    case "RequestFailed":
      return `The platform refused a passkey for ${rpId}. On a first run that is usually the association files: check the host serves them and that they name this app.`;
    case "NoCredentials":
      return "No passkey for this host reached this device. Create one, or check that the one from the web demo synced to this provider.";
    default:
      return typeof message === "string"
        ? message
        : "The passkey request failed.";
  }
}

export type { PasskeyWallet };
export { createAccount, describeError, revealMnemonic, signIn, signMessage };
