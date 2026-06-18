import { hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { getEvmAddress, isEvmAddress } from "../dist/index.js";
import { getSecp256k1PublicKey } from "../dist/secp256k1.js";
import { expectError } from "./helpers.js";

const PRIVATE_KEY_ONE = hexToBytes(
  "0000000000000000000000000000000000000000000000000000000000000001",
);

test("derives the EIP-55 checksummed EVM address for private key one", () => {
  const publicKey = getSecp256k1PublicKey(PRIVATE_KEY_ONE);

  expect(getEvmAddress(publicKey)).toBe(
    "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  );
});

test("derives the same EVM address from a compressed public key", () => {
  // Compressed form of private key one's public key (the secp256k1 generator).
  const compressedPublicKey = hexToBytes(
    "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
  );

  expect(getEvmAddress(compressedPublicKey)).toBe(
    "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  );
});

test("rejects invalid secp256k1 key material", () => {
  const invalidUncompressedPublicKey = new Uint8Array(65);
  invalidUncompressedPublicKey[0] = 4;

  expectError(() => getSecp256k1PublicKey(new Uint8Array(32)), "INPUT_INVALID");
  expectError(
    () => getEvmAddress(invalidUncompressedPublicKey),
    "INPUT_INVALID",
  );
});

test("isEvmAddress accepts lowercase, uppercase, and valid EIP-55 mixed case", () => {
  const checksummed = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
  const lower = checksummed.toLowerCase() as `0x${string}`;
  const upper = `0x${checksummed.slice(2).toUpperCase()}` as `0x${string}`;

  expect(isEvmAddress(checksummed)).toBe(true);
  expect(isEvmAddress(lower)).toBe(true);
  expect(isEvmAddress(upper)).toBe(true);
});

test("isEvmAddress rejects inconsistent EIP-55 mixed case", () => {
  // Flip one case bit from the valid checksum — should fail.
  const checksummed = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
  const tampered = `${checksummed.slice(0, -1)}F`; // last 'f' → 'F'

  expect(isEvmAddress(tampered)).toBe(false);
});

test("isEvmAddress rejects malformed strings", () => {
  expect(isEvmAddress("")).toBe(false);
  expect(isEvmAddress("0x")).toBe(false);
  expect(isEvmAddress("7E5F4552091A69125d5DfCb7b8C2659029395Bdf")).toBe(false);
  // Wrong length.
  expect(isEvmAddress("0x7E5F4552091A69125d5DfCb7b8C2659029395Bd")).toBe(false);
  // Non-hex character.
  expect(isEvmAddress("0xZE5F4552091A69125d5DfCb7b8C2659029395Bdf")).toBe(
    false,
  );
});
