import { expect, test } from "@playwright/test";
import { copyPrfOutput } from "../dist/passkey.js";

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
