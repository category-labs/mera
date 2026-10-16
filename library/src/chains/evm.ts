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

export { getEvmAddress };
