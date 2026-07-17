import { HDKey } from "@scure/bip32";
import {
  entropyToMnemonic,
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const PRF_OUTPUT_LENGTH = 32;

// BIP-44 path on coin type 60, Ethereum's registered type, which EVM accounts
// share; the address index varies on the external chain (the MetaMask
// convention).
const evmPath = (index: number): string => `m/44'/60'/0'/0/${index}`;

/**
 * Converts a 32-byte WebAuthn PRF output into the BIP-39 mnemonic that every
 * standard HD wallet derives from.
 *
 * The PRF output is used as 256 bits of BIP-39 entropy, so the same phrase
 * imported into a wallet app such as MetaMask reproduces the same addresses.
 * Changing this mapping would change every derived address.
 */
function prfOutputToMnemonic(prfOutput: Uint8Array): string {
  if (prfOutput.length !== PRF_OUTPUT_LENGTH) {
    throw new Error("PRF output must be 32 bytes");
  }
  return entropyToMnemonic(prfOutput, wordlist);
}

/** Derives the 64-byte BIP-39 seed (PBKDF2, empty passphrase). */
function mnemonicToSeed(mnemonic: string): Uint8Array {
  return mnemonicToSeedSync(mnemonic);
}

/** A fresh client-side 12-word BIP-39 mnemonic (128 bits of CSPRNG entropy). */
function createMnemonic(): string {
  return generateMnemonic(wordlist, 128);
}

/** Whether `mnemonic` is a valid BIP-39 phrase in the English wordlist. */
function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic, wordlist);
}

/** secp256k1 private key for EVM account `index` (BIP-32 over BIP-44). */
function deriveEvmPrivateKey(seed: Uint8Array, index: number): Uint8Array {
  const node = HDKey.fromMasterSeed(seed).derive(evmPath(index));
  if (!node.privateKey) {
    throw new Error("BIP-32 derivation produced no private key");
  }
  // Copy out of the HDKey so the signing session can own and later zero it.
  return new Uint8Array(node.privateKey);
}

export {
  createMnemonic,
  deriveEvmPrivateKey,
  isValidMnemonic,
  mnemonicToSeed,
  prfOutputToMnemonic,
};
