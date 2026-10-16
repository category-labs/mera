import type { EvmAddress, getPasskeyPrfOutput } from "@category-labs/mera";
import type { CostBasisStore } from "@category-labs/mera-demo-shared/position";
import { base64urlnopad } from "@scure/base";
import {
  deleteItemAsync,
  getItem,
  getItemAsync,
  type SecureStoreOptions,
  setItem,
  setItemAsync,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} from "expo-secure-store";
import { isAddress } from "viem";

const PRF_KEY = "mera.prf.v1";
const ACCOUNT_KEY = "mera.account.v1";
const COST_BASIS_PREFIX = "mera.costBasis.v1.";

// Reading the PRF item asks for a biometric or device credential.
const GATED = {
  requireAuthentication: true,
  keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  authenticationPrompt: "Unlock your account",
} satisfies SecureStoreOptions;

// Account metadata and cost basis hold no secrets, so the locked state reads
// them synchronously, without a prompt.
const UNGATED = {
  keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} satisfies SecureStoreOptions;

type StoredAccount = {
  address: EvmAddress;
  credentialId: string;
};

async function storePrfResult({
  credentialId,
  prfOutput,
}: getPasskeyPrfOutput.Result): Promise<void> {
  const stored = { credentialId, prfOutput: base64urlnopad.encode(prfOutput) };
  await setItemAsync(PRF_KEY, JSON.stringify(stored), GATED);
}

/**
 * The stored PRF result, read behind a biometric or device-credential prompt;
 * undefined when nothing is stored. Storage failures, declined
 * authentication, and malformed data throw.
 */
async function readStoredPrfResult(): Promise<
  getPasskeyPrfOutput.Result | undefined
> {
  const stored = await getItemAsync(PRF_KEY, GATED);
  if (stored === null) return undefined;
  const { credentialId, prfOutput } = JSON.parse(stored) as Record<
    string,
    unknown
  >;
  if (typeof credentialId !== "string" || typeof prfOutput !== "string") {
    throw new Error("Stored PRF result is malformed");
  }
  const bytes = new Uint8Array(base64urlnopad.decode(prfOutput));
  if (bytes.length !== 32) {
    throw new Error("Stored PRF output must be 32 bytes");
  }
  return { credentialId, prfOutput: bytes };
}

/** The stored account metadata; undefined when it is absent or malformed. */
function loadStoredAccount(): StoredAccount | undefined {
  try {
    const { address, credentialId } = (JSON.parse(
      getItem(ACCOUNT_KEY) ?? "null",
    ) ?? {}) as Record<string, unknown>;
    if (
      typeof address !== "string" ||
      !isAddress(address, { strict: false }) ||
      typeof credentialId !== "string"
    ) {
      return undefined;
    }
    return { address, credentialId };
  } catch {
    return undefined;
  }
}

function saveStoredAccount(account: StoredAccount): void {
  setItem(ACCOUNT_KEY, JSON.stringify(account), UNGATED);
}

/** Removes the stored account: the PRF output and the metadata. */
async function clearStoredAccount(): Promise<void> {
  await Promise.all([deleteItemAsync(PRF_KEY), deleteItemAsync(ACCOUNT_KEY)]);
}

/** Cost bases in SecureStore; an unreadable one reads as zero. */
const storedCostBasis: CostBasisStore = {
  load(address) {
    try {
      return BigInt(getItem(COST_BASIS_PREFIX + address) ?? 0);
    } catch {
      return 0n;
    }
  },
  save(address, basis) {
    try {
      setItem(COST_BASIS_PREFIX + address, basis.toString(), UNGATED);
    } catch {
      // A failed write leaves the basis in memory only.
    }
  },
};

export type { StoredAccount };
export {
  clearStoredAccount,
  loadStoredAccount,
  readStoredPrfResult,
  saveStoredAccount,
  storedCostBasis,
  storePrfResult,
};
