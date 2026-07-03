import { bytesToHex } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { getDeterministicPrfSaltV1 } from "../dist/index.js";

test("returns the fixed v1 deterministic PRF salt", () => {
  const salt = getDeterministicPrfSaltV1();

  expect(bytesToHex(salt)).toBe(
    "0843291565a6314a928d60d0e51a6d0c46a82b3faaa6e47560b920312ba35f90",
  );
});
