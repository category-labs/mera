import {
  createSecp256k1SigningSession,
  deriveEvmPrivateKey,
  type EvmAddress,
  getEvmAddress,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { HDKey } from "@scure/bip32";
import {
  entropyToMnemonic,
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

/** One EVM account and the live session that signs for it. */
type EvmAccount = {
  session: Secp256k1SigningSession;
  address: EvmAddress;
};

// BIP-44 path on coin type 60, which EVM accounts share, at address index 0:
// the first account MetaMask derives from the same phrase.
const EVM_ACCOUNT_PATH = "m/44'/60'/0'/0/0";

/**
 * The BIP-39 phrase with the PRF output as its 256 bits of entropy, so a
 * wallet app such as MetaMask that imports it derives the same addresses.
 * Zeroes `prfOutput`. Throws unless it is 32 bytes: BIP-39 also accepts
 * shorter entropy, which would open a different account.
 */
function prfOutputToMnemonic(prfOutput: Uint8Array): string {
  try {
    if (prfOutput.length !== 32) throw new Error("PRF output must be 32 bytes");
    return entropyToMnemonic(prfOutput, wordlist);
  } finally {
    prfOutput.fill(0);
  }
}

/**
 * Opens the demo's account for a PRF output: account 0, the account the
 * recovery phrase opens in a wallet app. Zeroes `prfOutput` and the derived
 * key before this returns or throws.
 */
function evmAccountFromPrfOutput(prfOutput: Uint8Array): EvmAccount {
  let privateKey: Uint8Array | undefined;
  try {
    privateKey = deriveEvmPrivateKey({ prfOutput, accountIndex: 0 });
    const session = createSecp256k1SigningSession({ privateKey });
    return { session, address: getEvmAddress(session.publicKey) };
  } finally {
    privateKey?.fill(0);
    prfOutput.fill(0);
  }
}

/**
 * Opens the demo's account for a BIP-39 phrase. The seed and the derived key
 * are zeroed before this returns or throws; the HD key objects keep their
 * copies until garbage collection.
 */
function evmAccountFromMnemonic(mnemonic: string): EvmAccount {
  const seed = mnemonicToSeedSync(mnemonic);
  let privateKey: Uint8Array | null = null;
  try {
    privateKey = HDKey.fromMasterSeed(seed).derive(EVM_ACCOUNT_PATH).privateKey;
    if (privateKey === null) throw new Error("Derivation produced no key");
    const session = createSecp256k1SigningSession({ privateKey });
    return { session, address: getEvmAddress(session.publicKey) };
  } finally {
    privateKey?.fill(0);
    seed.fill(0);
  }
}

/** A fresh 12-word phrase from 128 bits of CSPRNG entropy. */
function createMnemonic(): string {
  return generateMnemonic(wordlist, 128);
}

function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist);
}

export type { EvmAccount };
export {
  createMnemonic,
  evmAccountFromMnemonic,
  evmAccountFromPrfOutput,
  isValidMnemonic,
  prfOutputToMnemonic,
};
