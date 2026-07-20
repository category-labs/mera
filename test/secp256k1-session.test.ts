import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { createSecp256k1SigningSession, getEvmAddress } from "../dist/index.js";
import { expectError } from "./helpers.js";

const PRIVATE_KEY_ONE = hexToBytes(
  "0000000000000000000000000000000000000000000000000000000000000001",
);

test("signs 32-byte digests and locks the session", async () => {
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
    secp256k1.verify(signature.compact, digest, session.publicKey, {
      prehash: false,
    }),
  ).toBe(true);

  session.lock();

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

test("zeroes the caller's buffer when the private key is an invalid scalar", () => {
  // All-0xff exceeds the curve order, so it is a valid length but invalid scalar.
  const buffer = new Uint8Array(32).fill(0xff);

  expectError(
    () => createSecp256k1SigningSession({ consumePrivateKey: buffer }),
    "INPUT_INVALID",
  );

  expect(buffer).toEqual(new Uint8Array(32));
});

test("a using declaration locks the session when its scope exits", async () => {
  let escaped: ReturnType<typeof createSecp256k1SigningSession> | undefined;

  {
    using session = createSecp256k1SigningSession({
      consumePrivateKey: new Uint8Array(PRIVATE_KEY_ONE),
    });
    await session.signDigest(new Uint8Array(32).fill(1));
    escaped = session;
  }

  await expect(
    escaped.signDigest(new Uint8Array(32).fill(1)),
  ).rejects.toMatchObject({ code: "SESSION_LOCKED" });
});

test("signs the digest bytes read at call time, not later mutations", async () => {
  const session = createSecp256k1SigningSession({
    consumePrivateKey: new Uint8Array(PRIVATE_KEY_ONE),
  });

  const original = new Uint8Array(32).fill(1);
  const digest = new Uint8Array(original); // caller-owned buffer we will mutate
  const pending = session.signDigest(digest); // not awaited
  digest.fill(2);
  const signature = await pending;

  // The signature is over the bytes at call time, not the later mutation.
  expect(
    secp256k1.verify(signature.compact, original, session.publicKey, {
      prehash: false,
    }),
  ).toBe(true);
  expect(
    secp256k1.verify(signature.compact, digest, session.publicKey, {
      prehash: false,
    }),
  ).toBe(false);
});
