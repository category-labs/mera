import { bytesToHex } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { createDeterministicPrfSalt } from "../dist/index.js";

test("creates the canonical fixed deterministic PRF salt", () => {
  const salt = createDeterministicPrfSalt();

  expect(bytesToHex(salt)).toBe(
    "0843291565a6314a928d60d0e51a6d0c46a82b3faaa6e47560b920312ba35f90",
  );
});
