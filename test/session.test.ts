import { expect, test } from "@playwright/test";
import { createSigningKey } from "../dist/session.js";

function sharedBytes(values: number[]): Uint8Array {
  const bytes = new Uint8Array(new SharedArrayBuffer(values.length));
  bytes.set(values);
  return bytes;
}

test("derives the public key from the stored private-key snapshot", () => {
  const privateKey = sharedBytes([1, 2, 3, 4]);
  const original = new Uint8Array(privateKey);
  let snapshot: Uint8Array | undefined;

  const { key, publicKey } = createSigningKey(privateKey, (value) => {
    snapshot = value;
    const derived = new Uint8Array(value);
    privateKey.fill(9);
    return derived;
  });

  expect(privateKey).toEqual(new Uint8Array(4));
  expect(snapshot).not.toBe(privateKey);
  expect(snapshot?.buffer).not.toBe(privateKey.buffer);
  expect(snapshot?.buffer).toBeInstanceOf(ArrayBuffer);
  expect(publicKey).toEqual(original);
  expect(key.exportCopy()).toEqual(original);
  key.lock();
});

test("zeroes the stored private-key snapshot when validation fails", () => {
  const privateKey = sharedBytes([1, 2, 3, 4]);
  let snapshot: Uint8Array | undefined;

  expect(() => {
    createSigningKey(privateKey, (value) => {
      snapshot = value;
      throw new Error("invalid test key");
    });
  }).toThrow("invalid test key");

  expect(privateKey).toEqual(new Uint8Array(4));
  expect(snapshot).not.toBe(privateKey);
  expect(snapshot?.buffer).not.toBe(privateKey.buffer);
  expect(snapshot?.buffer).toBeInstanceOf(ArrayBuffer);
  expect(snapshot).toEqual(new Uint8Array(4));
});
