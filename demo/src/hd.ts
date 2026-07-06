import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { HDKey } from "@scure/bip32";
import {
  entropyToMnemonic,
  generateMnemonic,
  mnemonicToSeedSync,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const PRF_OUTPUT_LENGTH = 32;

// BIP-44 account paths. Ethereum varies the address index on the external
// chain (the MetaMask convention); Solana varies the account index and is
// hardened end to end (the Phantom / Solflare convention).
const ethereumPath = (index: number): string => `m/44'/60'/0'/0/${index}`;

/**
 * Converts a 32-byte WebAuthn PRF output into the BIP-39 mnemonic that every
 * standard HD wallet derives from.
 *
 * The PRF output is used as 256 bits of BIP-39 entropy, so the same phrase
 * imported into MetaMask or Phantom reproduces the same addresses. Changing
 * this mapping would change every derived address.
 */
function prfOutputToMnemonic(prfOutput: Uint8Array): string {
  if (prfOutput.length !== PRF_OUTPUT_LENGTH) {
    throw new Error("PRF output must be 32 bytes");
  }
  return entropyToMnemonic(prfOutput, wordlist);
}

/** Derives the 64-byte BIP-39 master seed (PBKDF2, empty passphrase). */
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

/** secp256k1 private key for Ethereum account `index` (BIP-32 over BIP-44). */
function deriveEthereumPrivateKey(seed: Uint8Array, index: number): Uint8Array {
  const node = HDKey.fromMasterSeed(seed).derive(ethereumPath(index));
  if (!node.privateKey) {
    throw new Error("BIP-32 derivation produced no private key");
  }
  // Copy out of the HDKey so the signing session can own and later zero it.
  return new Uint8Array(node.privateKey);
}

/** Ed25519 seed for Solana account `index` (SLIP-0010 over BIP-44). */
function deriveSolanaSeed(seed: Uint8Array, index: number): Uint8Array {
  let node = slip10Master(seed);
  for (const pathIndex of [44, 501, index, 0]) {
    node = slip10ChildHardened(node, pathIndex);
  }
  return node.key;
}

// ----- SLIP-0010 for Ed25519 ------------------------------------------------
// Ed25519 supports only hardened derivation. This implementation is validated
// against the official SLIP-0010 ed25519 test vectors and against the canonical
// BIP-39 test mnemonic's Phantom address; Phantom and Solflare derive Solana
// keys this exact way.

const ED25519_DOMAIN = utf8ToBytes("ed25519 seed");
const HARDENED_OFFSET = 0x80000000;

type Slip10Node = { key: Uint8Array; chainCode: Uint8Array };

function slip10Master(seed: Uint8Array): Slip10Node {
  const i = hmac(sha512, ED25519_DOMAIN, seed);
  return { key: i.slice(0, 32), chainCode: i.slice(32) };
}

function slip10ChildHardened(node: Slip10Node, index: number): Slip10Node {
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0x00;
  data.set(node.key, 1);
  new DataView(data.buffer).setUint32(
    33,
    (index + HARDENED_OFFSET) >>> 0,
    false,
  );
  const i = hmac(sha512, node.chainCode, data);
  return { key: i.slice(0, 32), chainCode: i.slice(32) };
}

export {
  createMnemonic,
  deriveEthereumPrivateKey,
  deriveSolanaSeed,
  isValidMnemonic,
  mnemonicToSeed,
  prfOutputToMnemonic,
};
