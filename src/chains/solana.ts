import { base58 } from "@scure/base";
import { MeraError } from "../errors.js";
import type { SolanaAddress } from "../types.js";

const ED25519_PUBLIC_KEY_LENGTH = 32;

/**
 * Derives the base58-encoded Solana address for an Ed25519 public key.
 *
 * @param publicKey - A 32-byte Ed25519 public key.
 * @returns The base58-encoded Solana address.
 * @throws MeraError with code `INPUT_INVALID` when `publicKey` is not 32 bytes.
 */
function getSolanaAddress(publicKey: Uint8Array): SolanaAddress {
  if (publicKey.length !== ED25519_PUBLIC_KEY_LENGTH) {
    throw new MeraError("INPUT_INVALID", "Ed25519 public key must be 32 bytes");
  }

  // Mints the SolanaAddress brand: encoding 32 validated bytes is what the
  // brand asserts, and a nominal brand cannot be produced without an assertion.
  return base58.encode(publicKey) as SolanaAddress;
}

export { getSolanaAddress };
