import { copyBytes } from "./encoding.js";
import { MeraError } from "./errors.js";

/**
 * Session-owned signing key whose lifetime is gated by `lock`, paired with the
 * public key derived from it.
 */
type SigningKey = {
  /**
   * Returns the live session-owned key for immediate use.
   *
   * @throws MeraError with code `SESSION_LOCKED` after `lock` has been called.
   */
  use(): Uint8Array<ArrayBuffer>;
  /** Zeroes the session-owned key and permanently locks this handle. */
  lock(): void;
  /** Public key derived from the session-owned key. */
  readonly publicKey: Uint8Array<ArrayBuffer>;
};

/**
 * Copies a private key into a lockable signing key and derives its public key.
 *
 * `privateKey` is copied into one session-owned snapshot. The snapshot is
 * zeroed by `lock` or, when `derivePublicKey` throws, before the error is
 * rethrown.
 *
 * @param privateKey - Private key to copy into the signing key.
 * @param derivePublicKey - Derives the public key from the owned snapshot; a throw doubles as private-key validation.
 * @returns The lockable signing key with its derived public key.
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
        return requireUnlocked(activePrivateKey);
      },
      lock(): void {
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
 * Returns the active private key, or throws once the session has been locked.
 *
 * @param privateKey - Session-owned private key, or `undefined` after `lock`.
 * @returns The live session-owned private key.
 * @throws MeraError with code `SESSION_LOCKED` when `privateKey` is undefined.
 */
function requireUnlocked(
  privateKey: Uint8Array<ArrayBuffer> | undefined,
): Uint8Array<ArrayBuffer> {
  if (privateKey === undefined) {
    throw new MeraError("SESSION_LOCKED", "Signing session is locked");
  }

  return privateKey;
}

export { createSigningKey };
