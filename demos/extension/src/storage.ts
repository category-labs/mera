import type { PasskeyCredentialMetadata } from "@category-labs/mera";
import { MAX_UINT256 } from "./config";

type StoredAccount = {
  address: `0x${string}`;
  credential: PasskeyCredentialMetadata;
};

const ACCOUNT_KEY = "mera.extension.account.v1";
const COST_BASIS_PREFIX = "mera.extension.costBasis.v1.";
const TRANSPORTS = new Set([
  "ble",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
]);

function isCredential(value: unknown): value is PasskeyCredentialMetadata {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.credentialId !== "string" ||
    record.credentialId.length > 2_048 ||
    !/^[A-Za-z0-9_-]+$/.test(record.credentialId)
  ) {
    return false;
  }
  return (
    record.transports === undefined ||
    (Array.isArray(record.transports) &&
      record.transports.length <= TRANSPORTS.size &&
      new Set(record.transports).size === record.transports.length &&
      record.transports.every(
        (transport) =>
          typeof transport === "string" && TRANSPORTS.has(transport),
      ))
  );
}

function parseStoredAccount(value: unknown): StoredAccount | undefined {
  if (!isStoredAccount(value)) return undefined;
  return {
    address: value.address,
    credential: {
      credentialId: value.credential.credentialId,
      ...(value.credential.transports === undefined
        ? {}
        : { transports: [...value.credential.transports] }),
    },
  };
}

function isStoredAccount(value: unknown): value is StoredAccount {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.address === "string" &&
    /^0x[0-9a-fA-F]{40}$/.test(record.address) &&
    isCredential(record.credential)
  );
}

function loadAccount(): StoredAccount | undefined {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return undefined;
    const account = parseStoredAccount(JSON.parse(raw) as unknown);
    if (account === undefined) {
      localStorage.removeItem(ACCOUNT_KEY);
      return undefined;
    }
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
    return account;
  } catch {
    localStorage.removeItem(ACCOUNT_KEY);
    return undefined;
  }
}

function saveAccount(account: StoredAccount): void {
  const stored = parseStoredAccount(account);
  if (stored === undefined) throw new Error("Invalid account metadata.");
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(stored));
}

function clearAccount(): void {
  localStorage.removeItem(ACCOUNT_KEY);
}

function loadCostBasis(address: string): bigint {
  try {
    const raw = localStorage.getItem(COST_BASIS_PREFIX + address);
    if (!raw || !/^(0|[1-9][0-9]*)$/.test(raw)) return 0n;
    const value = BigInt(raw);
    return value <= MAX_UINT256 ? value : 0n;
  } catch {
    return 0n;
  }
}

function saveCostBasis(address: string, value: bigint): void {
  if (value < 0n || value > MAX_UINT256) {
    throw new Error("Invalid cost basis.");
  }
  localStorage.setItem(COST_BASIS_PREFIX + address, value.toString());
}

export type { StoredAccount };
export {
  clearAccount,
  isCredential,
  isStoredAccount,
  loadAccount,
  loadCostBasis,
  saveAccount,
  saveCostBasis,
};
