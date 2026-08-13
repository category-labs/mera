import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import { createSecp256k1SigningSession, getEvmAddress } from "../dist/index.js";
import { expectError } from "./helpers.js";

const PRIVATE_KEY_ONE = hexToBytes(
  "0000000000000000000000000000000000000000000000000000000000000001",
);

test("signs 32-byte digests and ends the session", async () => {
  const buffer = new Uint8Array(PRIVATE_KEY_ONE);
  const session = createSecp256k1SigningSession({ privateKey: buffer });
  const digest = new Uint8Array(32).fill(1);
  const signature = await session.signDigest(digest);

  expect(buffer).toEqual(PRIVATE_KEY_ONE);

  // Private key one's public key is the secp256k1 generator point.
  expect(bytesToHex(session.publicKey)).toBe(
    "0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8",
  );
  expect(getEvmAddress(session.publicKey)).toBe(
    "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  );
  expect(signature.compact).toHaveLength(64);
  expect(
    secp256k1.verify(signature.compact, digest, session.publicKey, {
      prehash: false,
    }),
  ).toBe(true);

  session.end();

  await expect(session.signDigest(digest)).rejects.toMatchObject({
    code: "SESSION_ENDED",
  });
});

test("produces deterministic signatures", async () => {
  using firstSession = createSecp256k1SigningSession({
    privateKey: PRIVATE_KEY_ONE,
  });
  using secondSession = createSecp256k1SigningSession({
    privateKey: PRIVATE_KEY_ONE,
  });
  const digest = new Uint8Array(32).fill(1);
  const first = await firstSession.signDigest(digest);
  const second = await secondSession.signDigest(digest);

  expect(first).toEqual(second);
});

test("rejects non-32-byte digests", async () => {
  const session = createSecp256k1SigningSession({
    privateKey: PRIVATE_KEY_ONE,
  });

  await expect(session.signDigest(new Uint8Array(31))).rejects.toMatchObject({
    code: "INPUT_INVALID",
  });
});

test("rejects an invalid scalar and leaves the caller's buffer unmodified", () => {
  // All-0xff exceeds the curve order, so it is a valid length but invalid scalar.
  const buffer = new Uint8Array(32).fill(0xff);

  expectError(
    () => createSecp256k1SigningSession({ privateKey: buffer }),
    "INPUT_INVALID",
  );

  expect(buffer).toEqual(new Uint8Array(32).fill(0xff));

  // Zero is a valid length but not a valid scalar.
  expectError(
    () => createSecp256k1SigningSession({ privateKey: new Uint8Array(32) }),
    "INPUT_INVALID",
  );
});

test("a using declaration ends the session when its scope exits", async () => {
  let escaped: ReturnType<typeof createSecp256k1SigningSession> | undefined;

  {
    using session = createSecp256k1SigningSession({
      privateKey: PRIVATE_KEY_ONE,
    });
    await session.signDigest(new Uint8Array(32).fill(1));
    escaped = session;
  }

  await expect(
    escaped.signDigest(new Uint8Array(32).fill(1)),
  ).rejects.toMatchObject({ code: "SESSION_ENDED" });
});

test("signs the digest bytes read at call time, not later mutations", async () => {
  const session = createSecp256k1SigningSession({
    privateKey: PRIVATE_KEY_ONE,
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
