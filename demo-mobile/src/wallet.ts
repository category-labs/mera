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

// Matches the web demo's passkey labels. Neither value affects the PRF.
const RP_NAME = "mera demo";
const USER_NAME = "nad";

// The creation time distinguishes multiple passkeys in supported pickers.
const accountLabel = (): string => `Account ${new Date().toLocaleString()}`;

/** One account backed by a live signing session. */
type PasskeyWallet = {
  address: EvmAddress;
  credentialId: string;
  session: Secp256k1SigningSession;
  source: "passkey" | "cache";
  lock(): void;
};

/**
 * Creates a passkey for {@link rpId}, caches its PRF output, and derives its
 * account.
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
 * Signs in from the device cache or caches the result of a ceremony. An uncached
 * ceremony pins no credential, so the platform can offer every passkey for the
 * relying party.
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
 * Derives the web demo's account and clears reachable key buffers. BIP-32 keeps
 * internal path-node keys until garbage collection.
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

/** Signs `message` as EIP-191 personal data with the live session. */
async function signMessage(
  wallet: PasskeyWallet,
  message: string,
): Promise<`0x${string}`> {
  return toViemAccount(wallet.session).signMessage({ message });
}

/**
 * Re-derives the recovery phrase in a ceremony pinned to the signed-in
 * credential. This path does not read the device cache.
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
 * react-native-passkey rejects with a plain object rather than an `Error`. The
 * two cases below need clearer text than its `message` field provides.
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
