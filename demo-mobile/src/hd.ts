import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
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
 * This mapping is the one the web demo uses (demo/src/hd.ts). Change it here
 * and the app derives different addresses than the web app from the same
 * passkey.
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

/** secp256k1 private key for EVM account `index` (BIP-32 over BIP-44). */
function deriveEvmPrivateKey(seed: Uint8Array, index: number): Uint8Array {
  const node = HDKey.fromMasterSeed(seed).derive(evmPath(index));
  if (!node.privateKey) {
    throw new Error("BIP-32 derivation produced no private key");
  }
  return node.privateKey;
}

export { deriveEvmPrivateKey, mnemonicToSeed, prfOutputToMnemonic };
