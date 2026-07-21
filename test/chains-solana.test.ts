import { hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { getSolanaAddress } from "../dist/index.js";
import { expectError } from "./helpers.js";

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
