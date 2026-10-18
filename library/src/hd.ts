import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { MeraError } from "./errors.js";

const HARDENED_OFFSET = 0x80000000;
const SLIP10_ED25519_MASTER_KEY = utf8ToBytes("ed25519 seed");

/** Returns the hardened form of a BIP-32 child index. */
function hardened(index: number): number {
  return index + HARDENED_OFFSET;
}

function checkAccountDerivationInputs(
  prfOutput: Uint8Array,
  accountIndex: number,
): void {
  if (prfOutput.length !== 32) {
    throw new MeraError("INPUT_INVALID", "PRF output must be 32 bytes");
  }

  checkAccountIndex(accountIndex);
}

function checkAccountIndex(accountIndex: number): void {
  if (
    !Number.isInteger(accountIndex) ||
    accountIndex < 0 ||
    accountIndex >= HARDENED_OFFSET
  ) {
    throw new MeraError(
      "INPUT_INVALID",
      "accountIndex must be an integer from 0 to 2^31 - 1",
    );
  }
}

/**
 * Returns the 64-byte BIP-39 seed for entropy, with the English wordlist and
 * an empty passphrase.
 */
function bip39Seed(entropy: Uint8Array): Uint8Array<ArrayBuffer> {
  return mnemonicToSeedSync(entropyToMnemonic(entropy, wordlist));
}

/**
 * Derives the SLIP-0010 Ed25519 private key at `path` from a seed. Ed25519
 * defines hardened children only, so every index in `path` must be hardened.
 */
function slip10Ed25519PrivateKey(
  seed: Uint8Array,
  path: readonly number[],
): Uint8Array<ArrayBuffer> {
  // Each node is the 32-byte key followed by the 32-byte chain code.
  let node = hmac(sha512, SLIP10_ED25519_MASTER_KEY, seed);

  try {
    for (const index of path) {
      const parent = node;
      const data = new Uint8Array(37);
      data.set(parent.subarray(0, 32), 1);
      new DataView(data.buffer).setUint32(33, index);
      node = hmac(sha512, parent.subarray(32), data);
      data.fill(0);
      parent.fill(0);
    }

    return node.slice(0, 32);
  } finally {
    node.fill(0);
  }
}

export {
  bip39Seed,
  checkAccountDerivationInputs,
  checkAccountIndex,
  hardened,
  slip10Ed25519PrivateKey,
};
