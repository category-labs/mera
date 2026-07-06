import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { normalizeSecp256k1PublicKey } from "../secp256k1.js";
import type { EvmAddress } from "../types.js";

/**
 * Derives the EIP-55 checksummed EVM address for a secp256k1 public key.
 *
 * @param publicKey - A compressed or uncompressed secp256k1 public key.
 * @returns The EIP-55 mixed-case checksummed EVM address.
 * @throws MeraError with code `INPUT_INVALID` when `publicKey` is not valid secp256k1.
 */
function getEvmAddress(publicKey: Uint8Array): EvmAddress {
  const uncompressed = normalizeSecp256k1PublicKey(publicKey);
  const addressBytes = keccak_256(uncompressed.slice(1)).slice(-20);
  return toChecksumAddress(bytesToHex(addressBytes));
}

/**
 * Returns true when a string is a 20-byte `0x`-prefixed EVM address.
 *
 * All-lowercase and all-uppercase hex bodies are accepted as-is (no checksum
 * to verify). Mixed-case inputs are validated against EIP-55: an inconsistent
 * mixed-case address (a typo or a tampered string) is rejected.
 *
 * @param value - String to check.
 * @returns `true` when `value` is a 20-byte `0x`-prefixed EVM address with a valid (or absent) EIP-55 checksum.
 */
function isEvmAddress(value: string): value is EvmAddress {
  if (!/^0x[0-9a-fA-F]{40}$/u.test(value)) {
    return false;
  }
  const body = value.slice(2);
  if (body === body.toLowerCase() || body === body.toUpperCase()) {
    return true;
  }
  return toChecksumAddress(body.toLowerCase()) === value;
}

// EIP-55: each lowercase hex nibble is uppercased iff the corresponding nibble
// of keccak256(lowercase-hex-without-0x) is >= 8. Precondition: lowercaseHex is
// already lowercase; mixed-case input would produce a wrong checksum.
function toChecksumAddress(lowercaseHex: string): EvmAddress {
  const hash = keccak_256(utf8ToBytes(lowercaseHex));
  let body = "";
  for (const [i, hashByte] of hash
    .subarray(0, lowercaseHex.length / 2)
    .entries()) {
    const high = lowercaseHex.charAt(i * 2);
    const low = lowercaseHex.charAt(i * 2 + 1);
    body += hashByte >> 4 >= 8 ? high.toUpperCase() : high;
    body += (hashByte & 0xf) >= 8 ? low.toUpperCase() : low;
  }
  return `0x${body}`;
}

export { getEvmAddress, isEvmAddress };
