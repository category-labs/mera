import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { HDKey } from "@scure/bip32";
import { bip39Seed, checkAccountDerivationInputs } from "../hd.js";
import { normalizeSecp256k1PublicKey } from "../secp256k1.js";
import type { DerivePrivateKeyOptions, EvmAddress } from "../types.js";

/**
 * Derives the private key of an EVM account from a PRF output.
 *
 * @param options - PRF output and account index.
 * @returns A 32-byte secp256k1 private key.
 * @remarks
 * The PRF output is the entropy of a 24-word BIP-39 phrase from the English
 * wordlist, and the phrase's seed uses an empty passphrase. The key is the
 * BIP-32 key at `m/44'/60'/0'/0/{accountIndex}` under that seed. Wallet apps
 * such as MetaMask use the same path, so importing the phrase into one shows
 * the same accounts.
 *
 * The phrase exists as a JavaScript string, which cannot be zeroed, and
 * `@scure/bip32` leaves the intermediate keys and chain codes unzeroed.
 * @see {@link https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki | BIP-39}
 * @see {@link https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki | BIP-32}
 * @see {@link https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki | BIP-44}
 * @throws MeraError with code `INPUT_INVALID` when `prfOutput` is not 32 bytes, or `accountIndex` is not an integer from 0 to 2^31 - 1.
 */
function deriveEvmPrivateKey({
  prfOutput,
  accountIndex,
}: DerivePrivateKeyOptions): Uint8Array<ArrayBuffer> {
  checkAccountDerivationInputs(prfOutput, accountIndex);
  const seed = bip39Seed(prfOutput);

  try {
    const account = HDKey.fromMasterSeed(seed).derive(
      `m/44'/60'/0'/0/${accountIndex}`,
    );
    // HDKey types privateKey as nullable for keys built from a public key.
    return account.privateKey as Uint8Array<ArrayBuffer>;
  } finally {
    seed.fill(0);
  }
}

/**
 * Derives the EIP-55 checksummed EVM address for a secp256k1 public key.
 *
 * @param publicKey - A compressed or uncompressed secp256k1 public key.
 * @returns The EIP-55 mixed-case checksummed EVM address.
 * @throws MeraError with code `INPUT_INVALID` when `publicKey` is not valid secp256k1.
 */
function getEvmAddress(publicKey: Uint8Array): EvmAddress {
  const uncompressed = normalizeSecp256k1PublicKey(publicKey);
  const lowercaseHex = bytesToHex(
    keccak_256(uncompressed.subarray(1)).slice(-20),
  );

  // EIP-55 uppercases each hex digit whose matching digit in
  // keccak256(lowercaseHex) is 8 or more.
  const hashHex = bytesToHex(keccak_256(utf8ToBytes(lowercaseHex)));
  const checksummed = [...lowercaseHex]
    .map((char, i) =>
      Number.parseInt(hashHex.charAt(i), 16) >= 8 ? char.toUpperCase() : char,
    )
    .join("");

  return `0x${checksummed}`;
}

export { deriveEvmPrivateKey, getEvmAddress };
