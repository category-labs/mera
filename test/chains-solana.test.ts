import { hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import {
  getSolanaAddress,
  isSolanaAddress,
  type SolanaAddress,
} from "../dist/index.js";
import { expectError } from "./helpers.js";

// RFC 8032 test vector 1 Ed25519 public key.
const RFC_PUBLIC_KEY = hexToBytes(
  "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
);

test("encodes Ed25519 public keys as base58 Solana addresses", () => {
  const address = getSolanaAddress(RFC_PUBLIC_KEY);

  expect(address).toBe("FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z");
  expect(isSolanaAddress(address)).toBe(true);
});

test("isSolanaAddress narrows strings to SolanaAddress", () => {
  const value: string = "FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z";

  expect(isSolanaAddress(value)).toBe(true);
  if (isSolanaAddress(value)) {
    // Type-level contract: the predicate narrows a plain string to the brand.
    const narrowed: SolanaAddress = value;
    expect(narrowed).toBe(value);
  }
});

test("rejects public keys of the wrong length", () => {
  expectError(() => getSolanaAddress(new Uint8Array(31)), "INPUT_INVALID");
  expectError(() => getSolanaAddress(new Uint8Array(33)), "INPUT_INVALID");
});

test("isSolanaAddress rejects non-base58 strings and wrong-length payloads", () => {
  expect(isSolanaAddress("")).toBe(false);
  expect(isSolanaAddress("0OIl".repeat(11))).toBe(false); // 44 chars, but base58 excludes 0 O I l
  expect(isSolanaAddress("3")).toBe(false); // valid base58 char, but far too short for 32 bytes
});

test("isSolanaAddress accepts the character-length bounds of 32-byte payloads", () => {
  // 32 zero bytes encode to the shortest possible address: one "1" per byte.
  expect(isSolanaAddress("1".repeat(32))).toBe(true);
  expect(isSolanaAddress("1".repeat(31))).toBe(false);
  // 45 valid base58 chars exceed the 44-char maximum and are rejected before decoding.
  expect(isSolanaAddress("2".repeat(45))).toBe(false);
});
