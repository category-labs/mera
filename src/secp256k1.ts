import * as secp from "@noble/secp256k1";
import { PasskeyAccountError } from "./errors.js";
import { createSigningKey } from "./session.js";
import type {
  CreateSigningSessionOptions,
  Secp256k1Signature,
  Secp256k1SigningSession,
} from "./types.js";

const SECP256K1_DIGEST_LENGTH = 32;

/**
 * Derives an uncompressed secp256k1 public key from a private key.
 *
 * @internal
 * @param privateKey - A 32-byte secp256k1 private key.
 * @returns A 65-byte public key with the `0x04` uncompressed prefix.
 * @remarks Caller assumptions: the private key must be secret key material; the function does not clear or mutate the input.
 * @throws PasskeyAccountError with code `INPUT_INVALID` when `privateKey` is not a valid secp256k1 scalar.
 */
function getSecp256k1PublicKey(privateKey: Uint8Array): Uint8Array {
  try {
    return new Uint8Array(secp.getPublicKey(privateKey, false));
  } catch (cause) {
    throw new PasskeyAccountError(
      "INPUT_INVALID",
      "Private key is not a valid secp256k1 scalar",
      { cause },
    );
  }
}

/**
 * Converts a compressed or uncompressed secp256k1 public key to uncompressed form.
 *
 * @internal
 * @param publicKey - A compressed or uncompressed secp256k1 public key.
 * @returns A 65-byte public key with the `0x04` uncompressed prefix.
 * @throws PasskeyAccountError with code `INPUT_INVALID` when the key length, prefix, or curve point is invalid.
 */
function normalizeSecp256k1PublicKey(publicKey: Uint8Array): Uint8Array {
  try {
    return new Uint8Array(secp.Point.fromBytes(publicKey).toBytes(false));
  } catch (cause) {
    throw new PasskeyAccountError(
      "INPUT_INVALID",
      "Public key is not valid secp256k1",
      { cause },
    );
  }
}

/**
 * Wraps a secp256k1 private key in an explicitly lockable signing session.
 *
 * `signDigest` signs exactly 32 bytes without prehashing. Calling `lock` zeroes the active private-key copy and makes future signing or export fail.
 *
 * @param options - Signing session inputs.
 * @param options.consumePrivateKey - secp256k1 private key. Zeroed before this call returns or throws.
 * @returns An unlocked secp256k1 signing session.
 * @remarks Side effects: zeroes `consumePrivateKey` on every path; on success first copies it into session memory, which `lock()` later zeroes.
 * @throws PasskeyAccountError with code `INPUT_INVALID` when `consumePrivateKey` is not a valid secp256k1 scalar.
 */
function createSecp256k1SigningSession({
  consumePrivateKey,
}: CreateSigningSessionOptions): Secp256k1SigningSession {
  const { key, publicKey } = createSigningKey(
    consumePrivateKey,
    getSecp256k1PublicKey,
  );

  return {
    publicKey,
    async signDigest(digest32: Uint8Array): Promise<Secp256k1Signature> {
      const unlockedKey = key.use();

      if (digest32.length !== SECP256K1_DIGEST_LENGTH) {
        throw new PasskeyAccountError(
          "INPUT_INVALID",
          "Digest must be 32 bytes",
        );
      }

      // `digest32` is passed through without copying: noble's `prepMsg` returns the
      // same reference unchanged when `prehash: false`.
      const signature = await secp.signAsync(digest32, unlockedKey, {
        format: "recovered",
        lowS: true,
        prehash: false,
      });

      return {
        compact: signature.slice(1),
        recovery: signature[0],
      };
    },
    exportPrivateKey(): Uint8Array {
      return key.exportCopy();
    },
    lock(): void {
      key.lock();
    },
  };
}

export {
  createSecp256k1SigningSession,
  getSecp256k1PublicKey,
  normalizeSecp256k1PublicKey,
};
