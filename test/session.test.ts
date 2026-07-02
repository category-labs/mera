import { expect, test } from "@playwright/test";
import { createSigningKey } from "../dist/session.js";

test("derives the public key from the stored private-key snapshot", () => {
  const privateKey = new Uint8Array([1, 2, 3, 4]);
  const original = new Uint8Array(privateKey);

  const { key, publicKey } = createSigningKey(privateKey, (snapshot) => {
    const derived = new Uint8Array(snapshot);
    privateKey.fill(9);
    return derived;
  });

  expect(privateKey).toEqual(new Uint8Array(4));
  expect(publicKey).toEqual(original);
  expect(key.exportCopy()).toEqual(original);
});

test("zeroes the stored private-key snapshot when validation fails", () => {
  const privateKey = new Uint8Array([1, 2, 3, 4]);
  let snapshot: Uint8Array | undefined;

  expect(() => {
    createSigningKey(privateKey, (value) => {
      snapshot = value;
      throw new Error("invalid test key");
    });
  }).toThrow("invalid test key");

  expect(privateKey).toEqual(new Uint8Array(4));
  expect(snapshot).toEqual(new Uint8Array(4));
});
