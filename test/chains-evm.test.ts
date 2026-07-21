import { hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { getEvmAddress } from "../dist/index.js";
import { getSecp256k1PublicKey } from "../dist/secp256k1.js";
import { expectError } from "./helpers.js";

const PRIVATE_KEY_ONE = hexToBytes(
  "0000000000000000000000000000000000000000000000000000000000000001",
);
const ADDRESS_ONE = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";

test("derives the EIP-55 checksummed EVM address for private key one", () => {
  const address = getEvmAddress(getSecp256k1PublicKey(PRIVATE_KEY_ONE));

  expect(address).toBe(ADDRESS_ONE);
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
