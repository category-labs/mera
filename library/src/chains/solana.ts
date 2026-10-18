import { base58 } from "@scure/base";
import { MeraError } from "../errors.js";
import {
  bip39Seed,
  checkAccountDerivationInputs,
  hardened,
  slip10Ed25519PrivateKey,
} from "../hd.js";
import type { DerivePrivateKeyOptions } from "../types.js";

/**
 * Derives the private key of a Solana account from a PRF output.
 *
 * @param options - PRF output and account index.
 * @returns A 32-byte Ed25519 private key (the seed).
 * @remarks
 * The PRF output is the entropy of a 24-word BIP-39 phrase from the English
 * wordlist, and the phrase's seed uses an empty passphrase. The key is the
 * SLIP-0010 Ed25519 key at `m/44'/501'/{accountIndex}'/0'` under that seed.
 * Wallet apps such as Phantom use the same path, so importing the phrase into
 * one shows the same accounts.
 *
 * The phrase exists as a JavaScript string, which cannot be zeroed.
 * @see {@link https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki | BIP-39}
 * @see {@link https://github.com/satoshilabs/slips/blob/master/slip-0010.md | SLIP-0010}
 * @throws MeraError with code `INPUT_INVALID` when `prfOutput` is not 32 bytes, or `accountIndex` is not an integer from 0 to 2^31 - 1.
 */
function deriveSolanaPrivateKey({
  prfOutput,
  accountIndex,
}: DerivePrivateKeyOptions): Uint8Array<ArrayBuffer> {
  checkAccountDerivationInputs(prfOutput, accountIndex);
  const seed = bip39Seed(prfOutput);

  try {
    return slip10Ed25519PrivateKey(seed, [
      hardened(44),
      hardened(501),
      hardened(accountIndex),
      hardened(0),
    ]);
  } finally {
    seed.fill(0);
  }
}

/**
 * Derives the base58-encoded Solana address for an Ed25519 public key.
 *
 * @param publicKey - A 32-byte Ed25519 public key.
 * @returns The base58-encoded Solana address.
 * @throws MeraError with code `INPUT_INVALID` when `publicKey` is not 32 bytes.
 */
function getSolanaAddress(publicKey: Uint8Array): string {
  if (publicKey.length !== 32) {
    throw new MeraError("INPUT_INVALID", "Ed25519 public key must be 32 bytes");
  }

  return base58.encode(publicKey);
}

export { deriveSolanaPrivateKey, getSolanaAddress };
