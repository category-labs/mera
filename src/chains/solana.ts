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

/**
 * Returns true when a string is a valid base58-encoded Solana address.
 *
 * @param value - String to check.
 * @returns `true` when `value` decodes to 32 base58 bytes.
 */
function isSolanaAddress(value: string): value is SolanaAddress {
  // 32 bytes always encode to 32-44 base58 characters, so anything outside
  // that range cannot be an address; checking first caps the cost of the
  // big-integer base58 decode on arbitrarily long untrusted input.
  if (value.length < 32 || value.length > 44) {
    return false;
  }

  try {
    return base58.decode(value).length === ED25519_PUBLIC_KEY_LENGTH;
  } catch {
    return false;
  }
}

export { getSolanaAddress, isSolanaAddress };
