import { bytesToHex } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { getMeraPrfSalt } from "../dist/derived.js";

test("returns Mera's fixed PRF salt", () => {
  const salt = getMeraPrfSalt();

  expect(bytesToHex(salt)).toBe(
    "0372d7979ec1483f2f82d860d96f18058486fc65bf0f0cc1c1303aba83d0e772",
  );

  salt.fill(0);
  expect(bytesToHex(getMeraPrfSalt())).toBe(
    "0372d7979ec1483f2f82d860d96f18058486fc65bf0f0cc1c1303aba83d0e772",
  );
});
