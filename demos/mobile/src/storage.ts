import type { EvmAddress, getPasskeyPrfOutput } from "@category-labs/mera";
import { MAX_UINT256 } from "@category-labs/mera-demo-shared/validation";
import { base64urlnopad } from "@scure/base";
import {
  deleteItemAsync,
  getItemAsync,
  type SecureStoreOptions,
  setItemAsync,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} from "expo-secure-store";

const PRF_KEY = "mera.prf.v1";
const ACCOUNT_KEY = "mera.account.v1";
const COST_BASIS_PREFIX = "mera.costBasis.v1.";

// Reading the PRF item asks for a biometric or device credential.
const PRF_ITEM_OPTIONS = {
  requireAuthentication: true,
  keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  authenticationPrompt: "Unlock your account",
} satisfies SecureStoreOptions;

// Account metadata and cost basis hold no secrets; they stay readable without
// authentication so the locked state can render prompt-free.
const UNGATED_ITEM_OPTIONS = {
  keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} satisfies SecureStoreOptions;

const PRF_OUTPUT_LENGTH = 32;

type StoredPrfResult = Pick<getPasskeyPrfOutput.Result, "credentialId"> & {
  prfOutput: string;
};

type StoredAccount = {
  address: EvmAddress;
  credentialId: string;
};

/** Storage failures, declined authentication, and malformed data throw. */
async function readStoredPrfResult(): Promise<
  getPasskeyPrfOutput.Result | undefined
> {
  const stored = await getItemAsync(PRF_KEY, PRF_ITEM_OPTIONS);

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

  await setItemAsync(PRF_KEY, JSON.stringify(stored), PRF_ITEM_OPTIONS);
}

function parseStoredAccount(raw: string): StoredAccount | undefined {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (value === null || typeof value !== "object") return undefined;
  const { address, credentialId } = value as Record<string, unknown>;
  if (
    typeof address !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(address) ||
    typeof credentialId !== "string" ||
    credentialId.length > 2_048 ||
    !/^[A-Za-z0-9_-]+$/.test(credentialId)
  ) {
    return undefined;
  }
  return { address: address as EvmAddress, credentialId };
}

/** A malformed entry is deleted and reads as absent. */
async function loadStoredAccount(): Promise<StoredAccount | undefined> {
  const raw = await getItemAsync(ACCOUNT_KEY);
  if (raw === null) return undefined;
  const account = parseStoredAccount(raw);
  if (account === undefined) await deleteItemAsync(ACCOUNT_KEY);
  return account;
}

async function saveStoredAccount(account: StoredAccount): Promise<void> {
  await setItemAsync(
    ACCOUNT_KEY,
    JSON.stringify(account),
    UNGATED_ITEM_OPTIONS,
  );
}

/** Removes the stored account: the PRF output and the metadata. */
async function clearStoredAccount(): Promise<void> {
  await deleteItemAsync(PRF_KEY);
  await deleteItemAsync(ACCOUNT_KEY);
}

/** An absent, malformed, or unreadable basis reads as zero. */
async function loadCostBasis(address: string): Promise<bigint> {
  try {
    const raw = await getItemAsync(COST_BASIS_PREFIX + address);
    if (raw === null || !/^(0|[1-9][0-9]*)$/.test(raw)) return 0n;
    const value = BigInt(raw);
    return value <= MAX_UINT256 ? value : 0n;
  } catch {
    return 0n;
  }
}

async function saveCostBasis(address: string, value: bigint): Promise<void> {
  if (value < 0n || value > MAX_UINT256) {
    throw new Error("Invalid cost basis.");
  }
  await setItemAsync(
    COST_BASIS_PREFIX + address,
    value.toString(),
    UNGATED_ITEM_OPTIONS,
  );
}

export {
  clearStoredAccount,
  loadCostBasis,
  loadStoredAccount,
  readStoredPrfResult,
  saveCostBasis,
  saveStoredAccount,
  storePrfResult,
};
