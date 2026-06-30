import { expect, test } from "@playwright/test";
import { copyPrfOutput } from "../dist/passkey.js";
import { expectError } from "./helpers.js";

test("copyPrfOutput copies a plain ArrayBuffer without aliasing", () => {
  const source = new Uint8Array([1, 2, 3, 4]);
  const out = copyPrfOutput(source.buffer);

  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual([1, 2, 3, 4]);

  // Mutating the source buffer must not affect the copy.
  new Uint8Array(source.buffer)[0] = 99;
  expect(out[0]).toBe(1);
});

test("copyPrfOutput copies only an ArrayBufferView's window without aliasing", () => {
  // A 4-byte view sitting in the middle of an 8-byte buffer.
  const { buffer } = new Uint8Array([0, 0, 5, 6, 7, 8, 0, 0]);
  const view = new Uint8Array(buffer, 2, 4);
  const out = copyPrfOutput(view);

  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual([5, 6, 7, 8]);

  // Mutating the underlying buffer must not affect the copy.
  new Uint8Array(buffer)[2] = 99;
  expect(out[0]).toBe(5);
});

test("copyPrfOutput copies a plain array of byte values", () => {
  // The 1Password browser extension returns PRF output as a plain number array.
  const out = copyPrfOutput([10, 20, 30]);

  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual([10, 20, 30]);
});

test("copyPrfOutput accepts the boundary byte values 0 and 255", () => {
  expect([...copyPrfOutput([0, 255])]).toEqual([0, 255]);
});

test("copyPrfOutput rejects non-byte array values instead of coercing them", () => {
  // Uint8Array.from would silently coerce each of these (256 -> 0, -1 -> 255,
  // 1.5 -> 1, NaN -> 0). The result becomes HKDF key material, so a malformed
  // plain array must fail with PRF_UNAVAILABLE instead.
  expectError(() => copyPrfOutput([256]), "PRF_UNAVAILABLE");
  expectError(() => copyPrfOutput([-1]), "PRF_UNAVAILABLE");
  expectError(() => copyPrfOutput([1.5]), "PRF_UNAVAILABLE");
  expectError(() => copyPrfOutput([Number.NaN]), "PRF_UNAVAILABLE");
});
