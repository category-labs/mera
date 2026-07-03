import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { getSecp256k1PublicKey } from "../dist/secp256k1.js";
import { expectError } from "./helpers.js";

const PRIVATE_KEY_ONE = hexToBytes(
  "0000000000000000000000000000000000000000000000000000000000000001",
);

test("derives the uncompressed secp256k1 public key for private key one", () => {
  // Private key one's public key is the secp256k1 generator point.
  expect(bytesToHex(getSecp256k1PublicKey(PRIVATE_KEY_ONE))).toBe(
    "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8",
  );
});

test("rejects invalid secp256k1 key material", () => {
  // Zero is a valid length but not a valid scalar.
  expectError(() => getSecp256k1PublicKey(new Uint8Array(32)), "INPUT_INVALID");
});
