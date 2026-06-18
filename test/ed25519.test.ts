import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { getEd25519PublicKey } from "../dist/ed25519.js";
import { expectError } from "./helpers.js";

// RFC 8032 test vector 1
const RFC_SECRET = hexToBytes(
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
);
const RFC_PUBLIC_KEY = hexToBytes(
  "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
);

test("derives the Ed25519 public key for the RFC 8032 test seed", () => {
  expect(bytesToHex(getEd25519PublicKey(RFC_SECRET))).toBe(
    bytesToHex(RFC_PUBLIC_KEY),
  );
});

test("rejects invalid Ed25519 key material", () => {
  expectError(() => getEd25519PublicKey(new Uint8Array(31)), "INPUT_INVALID");
});
