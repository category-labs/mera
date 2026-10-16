import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  MeraError,
} from "@category-labs/mera";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";
import { describeError as describeDemoError } from "@category-labs/mera-demo-shared/errors";
import {
  type EvmAccount,
  evmAccountFromMnemonic,
  prfOutputToMnemonic,
} from "@category-labs/mera-demo-shared/hd";
import { newPasskeyOptions } from "@category-labs/mera-demo-shared/passkey";
import type { PasskeyError } from "react-native-passkey";
import { rpId } from "./config";
import {
  readStoredPrfResult,
  saveStoredAccount,
  storePrfResult,
} from "./storage";

type Wallet = EvmAccount & { credentialId: string };

async function createAccount(): Promise<Wallet> {
  return storeAndOpen(
    await createPasskeyWithPrfOutput({
      ...newPasskeyOptions(rpId),
      webAuthnClient: reactNativeWebAuthnClient,
    }),
  );
}

/**
 * Signs in with a ceremony that pins no credential, so the platform can offer
 * every passkey for the relying party.
 */
async function signIn(): Promise<Wallet> {
  return storeAndOpen(
    await getPasskeyPrfOutput({
      rpId,
      webAuthnClient: reactNativeWebAuthnClient,
    }),
  );
}

/**
 * Stores the ceremony result behind biometrics and the account metadata
 * beside it, then opens the wallet. A failed metadata write ends the session
 * before rethrowing.
 */
async function storeAndOpen(
  result: getPasskeyPrfOutput.Result,
): Promise<Wallet> {
  await storePrfResult(result);
  const wallet = toWallet(result);
  try {
    saveStoredAccount({
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
 * Restores the wallet from the stored PRF output. Reading it asks for a
 * biometric or device credential; no passkey prompt appears.
 */
async function unlockStoredWallet(): Promise<Wallet | undefined> {
  const stored = await readStoredPrfResult();
  return stored && toWallet(stored);
}

/** Zeroes the PRF output. */
function toWallet({
  credentialId,
  prfOutput,
}: getPasskeyPrfOutput.Result): Wallet {
  return {
    credentialId,
    ...evmAccountFromMnemonic(prfOutputToMnemonic(prfOutput)),
  };
}

/** Re-derives the recovery phrase in a ceremony pinned to the credential. */
async function revealMnemonic(credentialId: string): Promise<string> {
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId,
    credential: { credentialId },
    webAuthnClient: reactNativeWebAuthnClient,
  });
  return prfOutputToMnemonic(prfOutput);
}

/** The shared error text, with React Native wording for passkey failures. */
function describeError(error: unknown): string {
  if (error instanceof MeraError) {
    switch (error.code) {
      case "PRF_UNAVAILABLE":
        return "This passkey provider does not support the WebAuthn PRF extension. iOS needs 18 or newer; on Android, Google Password Manager and 1Password both supply it.";
      case "PASSKEY_OPERATION_FAILED":
        return describePasskeyFailure(error.cause);
      case "CRYPTO_UNAVAILABLE":
        return "The runtime provides no CSPRNG.";
    }
  }
  return describeDemoError(error);
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
