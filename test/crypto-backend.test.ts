import { ed25519 } from "@noble/curves/ed25519.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { expect, test } from "@playwright/test";

test("cryptographic backends expose frozen APIs without mutable hash registries", () => {
  expect(Object.isFrozen(ed25519)).toBe(true);
  expect(Object.isFrozen(secp256k1)).toBe(true);
  expect("hashes" in ed25519).toBe(false);
  expect("hashes" in secp256k1).toBe(false);
});
