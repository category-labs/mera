import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { deriveSolanaPrivateKey, getSolanaAddress } from "../dist/index.js";
import { expectError, SEQUENCE_PRF_OUTPUT } from "./helpers.js";

test("deriveSolanaPrivateKey derives the key at m/44'/501'/{accountIndex}'/0'", () => {
  const privateKey = deriveSolanaPrivateKey({
    prfOutput: SEQUENCE_PRF_OUTPUT,
    accountIndex: 2 ** 31 - 1,
  });

  expect(bytesToHex(privateKey)).toBe(
    "aea332468c44d8fb797602951d16c8144249c8359ebeac138fd86f6c09d01a80",
  );
});

test("deriveSolanaPrivateKey rejects other PRF output lengths and account indices", () => {
  for (const prfOutput of [new Uint8Array(16), new Uint8Array(33)]) {
    expectError(
      () => deriveSolanaPrivateKey({ prfOutput, accountIndex: 0 }),
      "INPUT_INVALID",
    );
  }

  for (const accountIndex of [-1, 0.5, 2 ** 31, Number.NaN]) {
    expectError(
      () =>
        deriveSolanaPrivateKey({
          prfOutput: SEQUENCE_PRF_OUTPUT,
          accountIndex,
        }),
      "INPUT_INVALID",
    );
  }
});

// RFC 8032 test vector 1 Ed25519 public key.
const RFC_PUBLIC_KEY = hexToBytes(
  "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
);

test("encodes Ed25519 public keys as base58 Solana addresses", () => {
  const address = getSolanaAddress(RFC_PUBLIC_KEY);

  expect(address).toBe("FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z");
});

test("rejects public keys of the wrong length", () => {
  expectError(() => getSolanaAddress(new Uint8Array(31)), "INPUT_INVALID");
  expectError(() => getSolanaAddress(new Uint8Array(33)), "INPUT_INVALID");
});
