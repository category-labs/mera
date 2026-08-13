import { expect, test } from "@playwright/test";
import { createSigningKey } from "../dist/session.js";
import { expectError } from "./helpers.js";

function sharedBytes(values: number[]): Uint8Array {
  const bytes = new Uint8Array(new SharedArrayBuffer(values.length));
  bytes.set(values);
  return bytes;
}

test("derives the public key from its stored private-key copy", () => {
  const privateKey = sharedBytes([1, 2, 3, 4]);
  const original = new Uint8Array(privateKey);
  let privateKeyCopy: Uint8Array | undefined;

  const { use, end, publicKey } = createSigningKey(privateKey, (value) => {
    privateKeyCopy = value;
    const derived = new Uint8Array(value);
    privateKey.fill(9);
    return derived;
  });

  // The caller's buffer keeps the callback's mutation.
  expect(privateKey).toEqual(new Uint8Array(4).fill(9));
  expect(privateKeyCopy).not.toBe(privateKey);
  expect(privateKeyCopy?.buffer).not.toBe(privateKey.buffer);
  expect(privateKeyCopy?.buffer).toBeInstanceOf(ArrayBuffer);
  expect(publicKey).toEqual(original);
  expect(use()).toEqual(original);
  end();
  expect(privateKeyCopy).toEqual(new Uint8Array(4));
  expectError(() => use(), "SESSION_ENDED");
});

test("clears the stored private-key copy when validation fails", () => {
  const privateKey = sharedBytes([1, 2, 3, 4]);
  let privateKeyCopy: Uint8Array | undefined;

  expect(() => {
    createSigningKey(privateKey, (value) => {
      privateKeyCopy = value;
      throw new Error("invalid test key");
    });
  }).toThrow("invalid test key");

  expect(privateKey).toEqual(new Uint8Array([1, 2, 3, 4]));
  expect(privateKeyCopy).not.toBe(privateKey);
  expect(privateKeyCopy?.buffer).not.toBe(privateKey.buffer);
  expect(privateKeyCopy?.buffer).toBeInstanceOf(ArrayBuffer);
  expect(privateKeyCopy).toEqual(new Uint8Array(4));
});
