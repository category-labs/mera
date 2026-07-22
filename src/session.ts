import { copyBytes } from "./encoding.js";
import { MeraError } from "./errors.js";

/**
 * Session-owned signing key whose lifetime is gated by `end`, paired with the
 * public key derived from it.
 */
type SigningKey = {
  /**
   * Returns the live session-owned key for immediate use.
   *
   * @throws MeraError with code `SESSION_ENDED` after `end` has been called.
   */
  use(): Uint8Array<ArrayBuffer>;
  /** Zeroes the session-owned key; later `use` calls throw. */
  end(): void;
  /** Public key derived from the session-owned key. */
  readonly publicKey: Uint8Array<ArrayBuffer>;
};

/**
 * Copies a private key into a signing key handle and derives its public key.
 *
 * `privateKey` is copied into one session-owned snapshot. The snapshot is
 * zeroed by `end` or, when `derivePublicKey` throws, before the error is
 * rethrown.
 *
 * @param privateKey - Private key to copy into the signing key.
 * @param derivePublicKey - Derives the public key from the owned snapshot; a throw doubles as private-key validation.
 * @returns The signing key handle with its derived public key.
 * @throws Rethrows whatever `derivePublicKey` throws.
 */
function createSigningKey(
  privateKey: Uint8Array,
  derivePublicKey: (privateKey: Uint8Array) => Uint8Array<ArrayBuffer>,
): SigningKey {
  let activePrivateKey: Uint8Array<ArrayBuffer> | undefined;

  try {
    // Derive and store from the same owned snapshot, so the public key cannot
    // diverge from the private key later used for signing.
    activePrivateKey = copyBytes(privateKey);
    const publicKey = derivePublicKey(activePrivateKey);

    return {
      use(): Uint8Array<ArrayBuffer> {
        return requireActive(activePrivateKey);
      },
      end(): void {
        if (activePrivateKey !== undefined) {
          activePrivateKey.fill(0);
          activePrivateKey = undefined;
        }
      },
      publicKey,
    };
  } catch (error) {
    activePrivateKey?.fill(0);
    throw error;
  }
}

/**
 * Returns the active private key, or throws once the session has ended.
 *
 * @param privateKey - Session-owned private key, or `undefined` after `end`.
 * @returns The live session-owned private key.
 * @throws MeraError with code `SESSION_ENDED` when `privateKey` is undefined.
 */
function requireActive(
  privateKey: Uint8Array<ArrayBuffer> | undefined,
): Uint8Array<ArrayBuffer> {
  if (privateKey === undefined) {
    throw new MeraError("SESSION_ENDED", "Signing session has ended");
  }

  return privateKey;
}

export { createSigningKey };
