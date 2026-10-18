import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { deriveEvmPrivateKey, getEvmAddress } from "../dist/index.js";
import { expectError, SEQUENCE_PRF_OUTPUT } from "./helpers.js";

const ADDRESS_ONE = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";

test("deriveEvmPrivateKey derives the key at m/44'/60'/0'/0/{accountIndex}", () => {
  const privateKey = deriveEvmPrivateKey({
    prfOutput: SEQUENCE_PRF_OUTPUT,
    accountIndex: 2 ** 31 - 1,
  });

  // viem's mnemonicToAccount returns the same key for the PRF output's phrase.
  expect(bytesToHex(privateKey)).toBe(
    "b24c9eb167e477f9c942deac60952a2504ff53014f790f7fadcc976ce18b06b7",
  );
});

test("deriveEvmPrivateKey rejects other PRF output lengths and account indices", () => {
  for (const prfOutput of [new Uint8Array(16), new Uint8Array(33)]) {
    expectError(
      () => deriveEvmPrivateKey({ prfOutput, accountIndex: 0 }),
      "INPUT_INVALID",
    );
  }

  for (const accountIndex of [-1, 0.5, 2 ** 31, Number.NaN]) {
    expectError(
      () =>
        deriveEvmPrivateKey({ prfOutput: SEQUENCE_PRF_OUTPUT, accountIndex }),
      "INPUT_INVALID",
    );
  }
});

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
