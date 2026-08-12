import type { getPasskeyPrfOutput } from "@category-labs/mera";
import { base64urlnopad } from "@scure/base";
import {
  deleteItemAsync,
  getItemAsync,
  type SecureStoreOptions,
  setItemAsync,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} from "expo-secure-store";

const KEY = "mera.prf.v1";

const ITEM_OPTIONS = {
  requireAuthentication: true,
  keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  authenticationPrompt: "Unlock your account",
} satisfies SecureStoreOptions;

const PRF_OUTPUT_LENGTH = 32;

type StoredPrfResult = Pick<getPasskeyPrfOutput.Result, "credentialId"> & {
  prfOutput: string;
};

/** Storage failures, declined authentication, and malformed data throw. */
async function readStoredPrfResult(): Promise<
  getPasskeyPrfOutput.Result | undefined
> {
  const stored = await getItemAsync(KEY, ITEM_OPTIONS);

  if (stored === null) {
    return undefined;
  }

  const { credentialId, prfOutput } = JSON.parse(
    stored,
  ) as Partial<StoredPrfResult>;

  if (typeof credentialId !== "string" || typeof prfOutput !== "string") {
    throw new Error("Stored PRF result is malformed");
  }

  const bytes = new Uint8Array(base64urlnopad.decode(prfOutput));

  if (bytes.length !== PRF_OUTPUT_LENGTH) {
    throw new Error("Stored PRF output must be 32 bytes");
  }

  return { credentialId, prfOutput: bytes };
}

async function storePrfResult(
  result: getPasskeyPrfOutput.Result,
): Promise<void> {
  const stored: StoredPrfResult = {
    credentialId: result.credentialId,
    prfOutput: base64urlnopad.encode(result.prfOutput),
  };

  await setItemAsync(KEY, JSON.stringify(stored), ITEM_OPTIONS);
}

async function clearStoredPrfResult(): Promise<void> {
  await deleteItemAsync(KEY);
}

export { clearStoredPrfResult, readStoredPrfResult, storePrfResult };
