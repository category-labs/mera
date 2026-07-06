import { copyBytes } from "./encoding.js";
import { MeraError } from "./errors.js";

/**
 * Handle to a session-owned private key whose lifetime is gated by `lock`.
 *
 * Centralizes the key-zeroing lifecycle shared by every signing session: the
 * caller's buffer is consumed (copied into one owned snapshot, then zeroed) on
 * creation, access throws once locked, and `lock` zeroes the session-owned copy.
 */
type LockableKey = {
  /**
   * Returns the live session-owned key for immediate use.
   *
   * @throws MeraError with code `SESSION_LOCKED` after `lock` has been called.
   */
  use(): Uint8Array<ArrayBuffer>;
  /** Zeroes the session-owned key and permanently locks this handle. */
  lock(): void;
};

/**
 * Consumes a private key into a lockable signing key and derives its public key.
 *
 * `consumePrivateKey` is copied into one session-owned snapshot and zeroed
 * before this function returns or throws. The snapshot is zeroed by `lock` or,
 * when `derivePublicKey` throws, before the error is rethrown.
 *
 * @param consumePrivateKey - Private key to consume.
 * @param derivePublicKey - Derives the public key from the owned snapshot; a throw doubles as private-key validation.
 * @returns The lockable key handle paired with the derived public key.
 * @throws Rethrows whatever `derivePublicKey` throws.
 */
function createSigningKey(
  consumePrivateKey: Uint8Array,
  derivePublicKey: (privateKey: Uint8Array) => Uint8Array<ArrayBuffer>,
): { key: LockableKey; publicKey: Uint8Array<ArrayBuffer> } {
  let activePrivateKey: Uint8Array<ArrayBuffer> | undefined;

  try {
    // Derive and store from the same owned snapshot, so the public key cannot
    // diverge from the private key later used for signing.
    activePrivateKey = copyBytes(consumePrivateKey);
    const publicKey = derivePublicKey(activePrivateKey);

    const key: LockableKey = {
      use(): Uint8Array<ArrayBuffer> {
        return requireUnlocked(activePrivateKey);
      },
      lock(): void {
        if (activePrivateKey !== undefined) {
          activePrivateKey.fill(0);
          activePrivateKey = undefined;
        }
      },
    };

    return { key, publicKey };
  } catch (error) {
    activePrivateKey?.fill(0);
    throw error;
  } finally {
    consumePrivateKey.fill(0);
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
