import { hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { getEvmAddress } from "../dist/index.js";
import { expectError } from "./helpers.js";

const ADDRESS_ONE = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";

test("derives the EIP-55 checksummed EVM address from an uncompressed public key", () => {
  // Uncompressed form of private key one's public key (the secp256k1 generator).
  const uncompressedPublicKey = hexToBytes(
    "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8",
  );

  expect(getEvmAddress(uncompressedPublicKey)).toBe(ADDRESS_ONE);
});

test("derives the same EVM address from a compressed public key", () => {
  // Compressed form of private key one's public key (the secp256k1 generator).
  const compressedPublicKey = hexToBytes(
    "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  );

  expect(getEvmAddress(compressedPublicKey)).toBe(ADDRESS_ONE);
});

test("rejects invalid secp256k1 public keys", () => {
  const invalidUncompressedPublicKey = new Uint8Array(65);
  invalidUncompressedPublicKey[0] = 4;

  expectError(
    () => getEvmAddress(invalidUncompressedPublicKey),
    "INPUT_INVALID",
  );
});
