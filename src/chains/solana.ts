import { base58 } from "@scure/base";
import { MeraError } from "../errors.js";
import type { SolanaAddress } from "../types.js";

/**
 * Derives the base58-encoded Solana address for an Ed25519 public key.
 *
 * @param publicKey - A 32-byte Ed25519 public key.
 * @returns The base58-encoded Solana address.
 * @throws MeraError with code `INPUT_INVALID` when `publicKey` is not 32 bytes.
 */
function getSolanaAddress(publicKey: Uint8Array): SolanaAddress {
  if (publicKey.length !== 32) {
    throw new MeraError("INPUT_INVALID", "Ed25519 public key must be 32 bytes");
  }

  // Mints the SolanaAddress brand: encoding 32 validated bytes is what the
  // brand asserts.
  return base58.encode(publicKey) as SolanaAddress;
}

export { getSolanaAddress };
