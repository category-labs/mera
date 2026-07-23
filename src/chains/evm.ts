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
  const addressBytes = keccak_256(uncompressed.subarray(1)).slice(-20);
  return toChecksumAddress(bytesToHex(addressBytes));
}

// EIP-55: each lowercase hex nibble is uppercased iff the corresponding nibble
// of keccak256(lowercase-hex-without-0x) is >= 8. Precondition: lowercaseHex is
// the 20-byte address as 40 lowercase hex chars; mixed case would produce a
// wrong checksum.
function toChecksumAddress(lowercaseHex: string): EvmAddress {
  const hash = keccak_256(utf8ToBytes(lowercaseHex));
  let body = "";
  for (const [i, hashByte] of hash.subarray(0, 20).entries()) {
    const high = lowercaseHex.charAt(i * 2);
    const low = lowercaseHex.charAt(i * 2 + 1);
    body += hashByte >> 4 >= 8 ? high.toUpperCase() : high;
    body += (hashByte & 0xf) >= 8 ? low.toUpperCase() : low;
  }
  return `0x${body}`;
}

export { getEvmAddress };
