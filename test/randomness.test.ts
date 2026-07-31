import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { expect, test } from "@playwright/test";
import {
  createEd25519SigningSession,
  createSecp256k1SigningSession,
} from "../dist/index.js";
import { createSecretVault } from "../dist/secret.js";
import { randomBytes } from "../dist/webcrypto.js";
import { STUB_CREDENTIAL_ID, withStubbedGlobal } from "./helpers.js";

const PRF_SALT = hexToBytes(
  "a1a2a3a4a5a6a7a8a9aaabacadaeafb0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0",
);
const PRF_OUTPUT = hexToBytes(
  "c1c2c3c4c5c6c7c8c9cacbcccdcecfd0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0",
);
const SIGNING_KEY = hexToBytes(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const DIGEST = hexToBytes(
  "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
);

// Runs fn with globalThis.crypto replaced by a wrapper that forwards
// getRandomValues to the real implementation while counting calls and bytes.
// subtle passes through unwrapped, so key derivation and AES-GCM still run.
async function withCountedRandomness<T>(
  fn: () => T | Promise<T>,
): Promise<{ result: T; calls: number; bytesDrawn: number }> {
  const real = globalThis.crypto;
  let calls = 0;
  let bytesDrawn = 0;
  const counting = {
    subtle: real.subtle,
    getRandomValues(array: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
      calls += 1;
      bytesDrawn += array.byteLength;
      return real.getRandomValues(array);
    },
  };

  const result = await withStubbedGlobal("crypto", counting, fn);
  return { result, calls, bytesDrawn };
}

test("randomBytes draws every byte from crypto.getRandomValues", async () => {
  const { result, calls, bytesDrawn } = await withCountedRandomness(() =>
    randomBytes(32),
  );

  expect(calls).toBe(1);
  expect(bytesDrawn).toBe(32);
  expect(result).toHaveLength(32);
});

test("createSecretVault draws a fresh GCM nonce from crypto.getRandomValues", async () => {
  const credential = {
    credentialId: STUB_CREDENTIAL_ID,
    prfSalt: PRF_SALT,
    prfOutput: PRF_OUTPUT,
  };
  const secret = new TextEncoder().encode("nonce provenance probe");

  const {
    result: first,
    calls,
    bytesDrawn,
  } = await withCountedRandomness(() =>
    createSecretVault({ credential, secret }),
  );
  const { result: second } = await withCountedRandomness(() =>
    createSecretVault({ credential, secret }),
  );

  // The 12-byte nonce is the only randomness in vault creation; everything
  // else is derived from the PRF output.
  expect(calls).toBe(1);
  expect(bytesDrawn).toBe(12);
  expect(second.nonce).not.toBe(first.nonce);
  expect(second.ciphertext).not.toBe(first.ciphertext);
});

// RFC 6979 (secp256k1) and Ed25519 both derive signature nonces from the key
// and message alone. Equal inputs must therefore produce equal signatures,
// and signing must never consult the RNG — so no RNG state can weaken a
// nonce or leak the key through nonce reuse.
test("signing sessions derive nonces deterministically without runtime randomness", async () => {
  const { result, calls } = await withCountedRandomness(async () => {
    const message = new TextEncoder().encode("determinism probe");

    const firstSecp = createSecp256k1SigningSession({
      privateKey: SIGNING_KEY,
    });
    const secondSecp = createSecp256k1SigningSession({
      privateKey: SIGNING_KEY,
    });
    const secpSignatures = [
      await firstSecp.signDigest(DIGEST),
      await secondSecp.signDigest(DIGEST),
    ];
    firstSecp.end();
    secondSecp.end();

    const firstEd = createEd25519SigningSession({ privateKey: SIGNING_KEY });
    const secondEd = createEd25519SigningSession({ privateKey: SIGNING_KEY });
    const edSignatures = [
      await firstEd.signMessage(message),
      await secondEd.signMessage(message),
    ];
    firstEd.end();
    secondEd.end();

    return { secpSignatures, edSignatures };
  });

  const [secpFirst, secpSecond] = result.secpSignatures;
  const [edFirst, edSecond] = result.edSignatures;

  expect(calls).toBe(0);
  expect(secpFirst?.compact).toEqual(secpSecond?.compact);
  expect(secpFirst?.recovery).toBe(secpSecond?.recovery);
  expect(edFirst).toEqual(edSecond);
});

// Statistical bounds sit at six standard deviations: the false-failure
// probability is about 2e-9 per check, while the defects the checks target
// (a stuck bit, a missing or biased byte value, correlated or repeated
// draws) land hundreds of standard deviations outside.
const SIGMA_BOUND = 6;
const DRAW_COUNT = 131_072;
const DRAW_LENGTH = 32;

test("randomBytes output stays within statistical bounds", () => {
  const pool = new Uint8Array(DRAW_COUNT * DRAW_LENGTH);
  const seenDraws = new Set<string>();
  let duplicateDraws = 0;

  for (let i = 0; i < DRAW_COUNT; i += 1) {
    const draw = randomBytes(DRAW_LENGTH);
    pool.set(draw, i * DRAW_LENGTH);
    const key = bytesToHex(draw);
    if (seenDraws.has(key)) duplicateDraws += 1;
    seenDraws.add(key);
  }

  // Two equal 32-byte draws implies a broken or repeating generator: the
  // birthday bound for 131,072 honest draws is about 2^-222.
  expect(duplicateDraws, "no repeated 32-byte draws").toBe(0);

  const bits = pool.length * 8;
  const byteCounts = new Uint32Array(256);
  let ones = 0;
  let bitRuns = 1;
  let longestOnesRun = 0;
  let currentOnesRun = 0;
  let previousBit = -1;
  let previousByte = -1;
  let lagProductSum = 0;

  for (const byte of pool) {
    byteCounts[byte] = (byteCounts[byte] ?? 0) + 1;
    if (previousByte >= 0) lagProductSum += previousByte * byte;
    previousByte = byte;

    for (let shift = 7; shift >= 0; shift -= 1) {
      const bit = (byte >> shift) & 1;
      ones += bit;
      if (previousBit >= 0 && bit !== previousBit) bitRuns += 1;
      previousBit = bit;
      currentOnesRun = bit === 1 ? currentOnesRun + 1 : 0;
      if (currentOnesRun > longestOnesRun) longestOnesRun = currentOnesRun;
    }
  }

  // Monobit: the ones count is binomial with mean bits/2 and standard
  // deviation sqrt(bits)/2.
  const monobitZ = Math.abs(2 * ones - bits) / Math.sqrt(bits);
  expect(monobitZ, "ones/zeros balance").toBeLessThanOrEqual(SIGMA_BOUND);

  // Runs: counts maximal blocks of equal bits. Too few runs means sticky
  // bits; too many means forced alternation. For ones fraction p the count
  // has mean 2·bits·p(1-p) and standard deviation ~2·sqrt(bits)·p(1-p).
  const onesFraction = ones / bits;
  const expectedRuns = 2 * bits * onesFraction * (1 - onesFraction);
  const runsZ =
    Math.abs(bitRuns - expectedRuns) /
    (2 * Math.sqrt(bits) * onesFraction * (1 - onesFraction));
  expect(runsZ, "bit run count").toBeLessThanOrEqual(SIGMA_BOUND);

  // Longest ones-run concentrates near log2(bits). The chance that no run
  // reaches k bits is about exp(-bits · 2^-(k+1)), which at log2(bits)-10
  // is e^-512; the chance that any run reaches k is about bits · 2^-(k+1),
  // which at log2(bits)+30 is 5e-10.
  const log2Bits = Math.log2(bits);
  expect(longestOnesRun, "longest ones-run").toBeGreaterThanOrEqual(
    Math.floor(log2Bits) - 10,
  );
  expect(longestOnesRun, "longest ones-run").toBeLessThanOrEqual(
    Math.ceil(log2Bits) + 30,
  );

  const expectedPerByte = pool.length / 256;
  let chiSquare = 0;
  let maxByteCount = 0;
  let entropy = 0;
  let sum = 0;
  let sumOfSquares = 0;

  for (let value = 0; value < 256; value += 1) {
    const count = byteCounts[value] ?? 0;
    chiSquare += (count - expectedPerByte) ** 2 / expectedPerByte;
    if (count > maxByteCount) maxByteCount = count;
    if (count > 0) {
      const fraction = count / pool.length;
      entropy -= fraction * Math.log2(fraction);
    }
    sum += value * count;
    sumOfSquares += value * value * count;
  }

  // Chi-square over byte values has 255 degrees of freedom, so mean 255 and
  // standard deviation sqrt(510).
  const chiSquareZ = Math.abs(chiSquare - 255) / Math.sqrt(510);
  expect(chiSquareZ, "byte-frequency chi-square").toBeLessThanOrEqual(
    SIGMA_BOUND,
  );

  // The most common byte is the maximum of 256 binomial bins and is expected
  // near +2.7 standard deviations, so the bound moves out to 7 to keep the
  // same false-failure margin (256 · P(z > 7) ≈ 3e-10).
  const maxByteZ =
    (maxByteCount - expectedPerByte) / Math.sqrt(expectedPerByte * (255 / 256));
  expect(maxByteZ, "most common byte excess").toBeLessThanOrEqual(7);

  // Sample entropy under-reads by 255/(2N·ln 2) ≈ 4e-5 bits at this size, so
  // a healthy source sits above 7.9999; a distribution missing even one byte
  // value caps at log2(255) ≈ 7.9944 and fails.
  expect(entropy, "byte entropy").toBeGreaterThan(7.999);

  // Lag-1 serial correlation of independent bytes is ~N(0, 1/sqrt(N)).
  const mean = sum / pool.length;
  const variance = sumOfSquares / pool.length - mean * mean;
  const covariance = lagProductSum / (pool.length - 1) - mean * mean;
  const serialZ = Math.abs(covariance / variance) * Math.sqrt(pool.length);
  expect(serialZ, "lag-1 serial correlation").toBeLessThanOrEqual(SIGMA_BOUND);
});
