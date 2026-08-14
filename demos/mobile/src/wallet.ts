import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  type EvmAddress,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";
import {
  deriveEvmPrivateKey,
  mnemonicToSeed,
  prfOutputToMnemonic,
} from "@category-labs/mera-demo-shared/hd";
import type { PasskeyError } from "react-native-passkey";
import { BaseError as ViemError } from "viem";
import { rpId } from "./config";
import {
  readStoredPrfResult,
  saveStoredAccount,
  storePrfResult,
} from "./storage";

const RP_NAME = "mera demo";
const USER_NAME = "nad";

const passkeyDisplayName = (): string =>
  `Account ${new Date().toLocaleString()}`;

type Wallet = {
  address: EvmAddress;
  credentialId: string;
  session: Secp256k1SigningSession;
};

async function createAccount(): Promise<Wallet> {
  const created = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: RP_NAME },
    user: { name: USER_NAME, displayName: passkeyDisplayName() },
    webAuthnClient: reactNativeWebAuthnClient,
  });
  return storeAndOpenWallet(created);
}

/**
 * Signs in with a ceremony that pins no credential, so the platform can offer
 * every passkey for the relying party.
 */
async function signIn(): Promise<Wallet> {
  const asserted = await getPasskeyPrfOutput({
    rpId,
    webAuthnClient: reactNativeWebAuthnClient,
  });
  return storeAndOpenWallet(asserted);
}

/**
 * Stores the ceremony result, derives the wallet, and records the account
 * metadata for the locked state. A failed metadata write ends the session
 * before rethrowing, so the signing key does not outlive the error.
 */
async function storeAndOpenWallet(
  result: getPasskeyPrfOutput.Result,
): Promise<Wallet> {
  await storePrfResult(result);
  const wallet = toWallet(result);
  try {
    await saveStoredAccount({
      address: wallet.address,
      credentialId: wallet.credentialId,
    });
  } catch (error) {
    wallet.session.end();
    throw error;
  }
  return wallet;
}

/**
 * Restores the wallet from the stored PRF output. Reading the store asks for
 * a biometric or device credential; no passkey prompt appears.
 */
async function unlockStoredWallet(): Promise<Wallet | undefined> {
  const stored = await readStoredPrfResult();
  return stored === undefined ? undefined : toWallet(stored);
}

/**
 * Clears reachable key buffers after derivation. BIP-32 keeps internal
 * path-node keys until garbage collection.
 */
function toWallet({
  credentialId,
  prfOutput,
}: getPasskeyPrfOutput.Result): Wallet {
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
    };
  } finally {
    seed.fill(0);
    privateKey?.fill(0);
  }
}

/**
 * Re-derives the recovery phrase in a ceremony pinned to the stored
 * credential.
 */
async function revealMnemonic(credentialId: string): Promise<string> {
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId,
    credential: { credentialId },
    webAuthnClient: reactNativeWebAuthnClient,
  });

  try {
    return prfOutputToMnemonic(prfOutput);
  } finally {
    prfOutput.fill(0);
  }
}

function describeError(error: unknown): string {
  if (isMeraError(error)) {
    switch (error.code) {
      case "PRF_UNAVAILABLE":
        return "This passkey provider does not support the WebAuthn PRF extension. iOS needs 18 or newer; on Android, Google Password Manager and 1Password both supply it.";
      case "PASSKEY_OPERATION_FAILED":
        return describePasskeyFailure(error.cause);
      case "SESSION_ENDED":
        return "The session has ended. Connect again.";
      case "CRYPTO_UNAVAILABLE":
        return "The runtime provides no CSPRNG.";
      default:
        return error.message;
    }
  }

  // A viem error's `message` appends the request URL, body, and hex payload;
  // `shortMessage` is its one-line summary, e.g. "Transaction creation failed."
  if (error instanceof ViemError) return error.shortMessage;
  return error instanceof Error ? error.message : String(error);
}

function describePasskeyFailure(cause: unknown): string {
  // react-native-passkey rejects with a PasskeyError-shaped object, not Error.
  const { error, message } = (cause ?? {}) as Partial<PasskeyError>;

  switch (error) {
    // react-native-passkey replaces the platform's association error with a
    // misleading message about missing credentials.
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

export type { Wallet };
export {
  createAccount,
  describeError,
  revealMnemonic,
  signIn,
  unlockStoredWallet,
};
