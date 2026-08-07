import type { PasskeyPrfResult } from "@category-labs/mera";
import { base64urlnopad } from "@scure/base";
import {
  deleteItemAsync,
  getItemAsync,
  setItemAsync,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} from "expo-secure-store";

const KEY = "mera.prf.v1";

// The platform keystore encrypts the item and requires local authentication to
// read it. Backups cannot move it to another device.
const ITEM_OPTIONS = {
  requireAuthentication: true,
  keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  authenticationPrompt: "Unlock your account",
} as const;

const PRF_OUTPUT_LENGTH = 32;

type StoredPrfResult = { credentialId: string; prfOutput: string };

/**
 * Reads a valid cached result. Missing, unreadable, rejected, and malformed
 * items return `undefined` so sign-in falls back to a ceremony.
 */
async function readCachedPrfResult(): Promise<PasskeyPrfResult | undefined> {
  try {
    const stored = await getItemAsync(KEY, ITEM_OPTIONS);

    if (stored === null) {
      return undefined;
    }

    const { credentialId, prfOutput } = JSON.parse(
      stored,
    ) as Partial<StoredPrfResult>;

    if (typeof credentialId !== "string" || typeof prfOutput !== "string") {
      return undefined;
    }

    // decode hands back a Uint8Array over an unknown buffer kind; the copy is
    // what gives PasskeyPrfResult the Uint8Array<ArrayBuffer> it declares.
    const bytes = new Uint8Array(base64urlnopad.decode(prfOutput));

    return bytes.length === PRF_OUTPUT_LENGTH
      ? { credentialId, prfOutput: bytes }
      : undefined;
  } catch {
    return undefined;
  }
}

/** Caches one ceremony result when the device supports authenticated storage. */
async function cachePrfResult(result: PasskeyPrfResult): Promise<void> {
  const stored: StoredPrfResult = {
    credentialId: result.credentialId,
    prfOutput: base64urlnopad.encode(result.prfOutput),
  };

  await setItemAsync(KEY, JSON.stringify(stored), ITEM_OPTIONS).catch(
    () => undefined,
  );
}

/** Drops the cached result, so the next sign-in runs a passkey ceremony. */
async function clearCachedPrfResult(): Promise<void> {
  await deleteItemAsync(KEY);
}

export { cachePrfResult, clearCachedPrfResult, readCachedPrfResult };
