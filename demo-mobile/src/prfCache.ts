import type { PasskeyPrfResult } from "@category-labs/mera";
import { base64urlnopad } from "@scure/base";
import {
  deleteItemAsync,
  getItemAsync,
  setItemAsync,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} from "expo-secure-store";

const KEY = "mera.prf.v1";

// The item is encrypted by a key the platform keystore holds and this app never
// sees. Reading it needs a biometric or device-credential check, so a cached
// PRF output is no more ambient than one a ceremony returns. Keeping it to this
// device stops a restored backup from carrying it to a phone the passkey never
// reached.
const ITEM_OPTIONS = {
  requireAuthentication: true,
  keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  authenticationPrompt: "Unlock your account",
} as const;

const PRF_OUTPUT_LENGTH = 32;

type StoredPrfResult = { credentialId: string; prfOutput: string };

/**
 * Reads the cached ceremony result, or `undefined` when nothing is stored, the
 * item no longer decrypts, the person dismisses the prompt, or what comes back
 * is not the shape this wrote. Enrolling a new fingerprint invalidates the
 * keystore key, which lands here as well.
 *
 * Every one of those falls back to a ceremony, so the cache never needs
 * repairing and losing it costs nothing. That holds only while every failure
 * ends here, which is why the item is checked rather than just parsed: a PRF
 * output of the wrong length would throw further down, past the fallback.
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

/**
 * Caches one ceremony result, and gives up quietly when the device cannot hold
 * it: a phone with no biometric or device credential enrolled has nothing to
 * gate the item on. Sign-in has already succeeded by the time this runs, and
 * the next one simply runs another ceremony.
 */
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
