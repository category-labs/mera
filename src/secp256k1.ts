import { secp256k1 } from "@noble/curves/secp256k1.js";
import { MeraError } from "./errors.js";
import { createSigningKey } from "./session.js";
import type {
  CreateSigningSessionOptions,
  Secp256k1Signature,
  Secp256k1SigningSession,
} from "./types.js";

/**
 * Derives an uncompressed secp256k1 public key from a 32-byte private key.
 *
 * @param privateKey - A 32-byte secp256k1 private key.
 * @returns A 65-byte public key with the `0x04` uncompressed prefix.
 * @throws MeraError with code `INPUT_INVALID` when `privateKey` is not a valid secp256k1 scalar.
 * @internal
 */
function getSecp256k1PublicKey(
  privateKey: Uint8Array,
): Uint8Array<ArrayBuffer> {
  try {
    return new Uint8Array(secp256k1.getPublicKey(privateKey, false));
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
function normalizeSecp256k1PublicKey(
  publicKey: Uint8Array,
): Uint8Array<ArrayBuffer> {
  try {
    return new Uint8Array(secp256k1.Point.fromBytes(publicKey).toBytes(false));
  } catch (cause) {
    throw new MeraError("INPUT_INVALID", "Public key is not valid secp256k1", {
      cause,
    });
  }
}

/**
 * Creates a lockable signing session from a secp256k1 private key.
 *
 * @param options - Signing session inputs; fields are documented on {@link CreateSigningSessionOptions}.
 * @returns An unlocked secp256k1 signing session.
 * @throws MeraError with code `INPUT_INVALID` when `privateKey` is not a valid secp256k1 scalar.
 */
function createSecp256k1SigningSession({
  privateKey,
}: CreateSigningSessionOptions): Secp256k1SigningSession {
  const { use, lock, publicKey } = createSigningKey(
    privateKey,
    getSecp256k1PublicKey,
  );

  return {
    publicKey,
    async signDigest(digest32: Uint8Array): Promise<Secp256k1Signature> {
      if (digest32.length !== 32) {
        throw new MeraError("INPUT_INVALID", "Digest must be 32 bytes");
      }

      const unlockedKey = use();
      const signature = secp256k1.sign(digest32, unlockedKey, {
        format: "recovered",
        lowS: true,
        prehash: false,
      });

      // noble's "recovered" format is 65 bytes: the recovery ID, then r || s.
      const recovery = signature[0];

      // A recovery ID of 2 or 3 requires r >= the curve order (probability
      // about 2^-127) and cannot be address-recovered from a parity bit, so
      // fail loudly instead of returning an unusable ID. The check also
      // narrows the byte to the declared `0 | 1`.
      if (recovery !== 0 && recovery !== 1) {
        throw new MeraError(
          "INPUT_INVALID",
          `Signature recovery ID must be 0 or 1, got ${recovery}`,
        );
      }

      return {
        compact: signature.slice(1),
        recovery,
      };
    },
    lock,
    [Symbol.dispose]: lock,
  };
}

export {
  createSecp256k1SigningSession,
  getSecp256k1PublicKey,
  normalizeSecp256k1PublicKey,
};
