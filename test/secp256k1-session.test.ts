import { hexToBytes } from "@noble/hashes/utils.js";
import * as secp from "@noble/secp256k1";
import { expect, test } from "@playwright/test";
import { createSecp256k1SigningSession, getEvmAddress } from "../dist/index.js";
import { expectError } from "./helpers.js";

const PRIVATE_KEY_ONE = hexToBytes(
  "0000000000000000000000000000000000000000000000000000000000000001",
);

test("signs 32-byte digests and locks the session", async () => {
  const original = new Uint8Array(PRIVATE_KEY_ONE);
  const buffer = new Uint8Array(PRIVATE_KEY_ONE);
  const session = createSecp256k1SigningSession({ consumePrivateKey: buffer });
  const digest = new Uint8Array(32).fill(1);
  const signature = await session.signDigest(digest);

  // Caller's buffer was zeroed by the session.
  expect(buffer).toEqual(new Uint8Array(32));

  expect(getEvmAddress(session.publicKey)).toBe(
    "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  );
  expect(signature.compact).toHaveLength(64);
  expect(
    secp.verify(signature.compact, digest, session.publicKey, {
      prehash: false,
    }),
  ).toBe(true);
  expect(session.exportPrivateKey()).toEqual(original);

  session.lock();

  expectError(() => session.exportPrivateKey(), "SESSION_LOCKED");
  await expect(session.signDigest(digest)).rejects.toMatchObject({
    code: "SESSION_LOCKED",
  });
});

test("rejects non-32-byte digests", async () => {
  const session = createSecp256k1SigningSession({
    consumePrivateKey: new Uint8Array(PRIVATE_KEY_ONE),
  });

  await expect(session.signDigest(new Uint8Array(31))).rejects.toMatchObject({
    code: "INPUT_INVALID",
  });
});

test("signs the digest snapshot taken at call time, not later mutations", async () => {
  const session = createSecp256k1SigningSession({
    consumePrivateKey: new Uint8Array(PRIVATE_KEY_ONE),
  });

  const original = new Uint8Array(32).fill(1);
  const digest = new Uint8Array(original); // caller-owned buffer we will mutate
  const pending = session.signDigest(digest); // not awaited
  digest.fill(2); // mutate before noble reads the buffer (it reads after its await)
  const signature = await pending;

  // The signature is over the bytes at call time, not the later mutation.
  expect(
    secp.verify(signature.compact, original, session.publicKey, {
      prehash: false,
    }),
  ).toBe(true);
  expect(
    secp.verify(signature.compact, digest, session.publicKey, {
      prehash: false,
    }),
  ).toBe(false);
});
