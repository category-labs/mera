import * as secp from "@noble/secp256k1";
import { copyBytes } from "./encoding.js";
import { MeraError } from "./errors.js";
import { createSigningKey } from "./session.js";
import type {
  CreateSigningSessionOptions,
  Secp256k1Signature,
  Secp256k1SigningSession,
} from "./types.js";

/**
 * Derives an uncompressed secp256k1 public key from a 32-byte private key.
 * The input is not modified.
 *
 * @param privateKey - A 32-byte secp256k1 private key.
 * @returns A 65-byte public key with the `0x04` uncompressed prefix.
 * @throws MeraError with code `INPUT_INVALID` when `privateKey` is not a valid secp256k1 scalar.
 * @internal
 */
function getSecp256k1PublicKey(privateKey: Uint8Array): Uint8Array {
  try {
    return new Uint8Array(secp.getPublicKey(privateKey, false));
  } catch (cause) {
    throw new MeraError(
      "INPUT_INVALID",
      "Private key is not a valid secp256k1 scalar",
      { cause },
    );
  }
}

/**
 * Converts a compressed or uncompressed secp256k1 public key to uncompressed form.
 *
 * @param publicKey - A compressed or uncompressed secp256k1 public key.
 * @returns A 65-byte public key with the `0x04` uncompressed prefix.
 * @throws MeraError with code `INPUT_INVALID` when the key length, prefix, or curve point is invalid.
 * @internal
 */
function normalizeSecp256k1PublicKey(publicKey: Uint8Array): Uint8Array {
  try {
    return new Uint8Array(secp.Point.fromBytes(publicKey).toBytes(false));
  } catch (cause) {
    throw new MeraError("INPUT_INVALID", "Public key is not valid secp256k1", {
      cause,
    });
  }
}

/**
 * Wraps a secp256k1 private key in an explicitly lockable signing session.
 *
 * `signDigest` signs exactly 32 bytes without prehashing. `lock` zeroes the
 * session-owned private-key copy and makes future signing fail.
 *
 * @param options - Signing session inputs.
 * @returns An unlocked secp256k1 signing session.
 * @throws MeraError with code `INPUT_INVALID` when `consumePrivateKey` is not a valid secp256k1 scalar.
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
      if (digest32.length !== 32) {
        throw new MeraError("INPUT_INVALID", "Digest must be 32 bytes");
      }

      // Signing reads the buffer after an await; copy it now so a later mutation can't change the signed bytes.
      const digest = copyBytes(digest32);
      const unlockedKey = key.use();
      const signature = await secp.signAsync(digest, unlockedKey, {
        format: "recovered",
        lowS: true,
        prehash: false,
      });

      // noble's "recovered" format is 65 bytes: the recovery ID, then r || s.
      return {
        compact: signature.slice(1),
        recovery: signature[0],
      };
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
