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
  use(): Uint8Array;
  /** Zeroes the session-owned key and permanently locks this handle. */
  lock(): void;
};

/**
 * Consumes a private key into a lockable signing key and derives its public key.
 *
 * The caller's buffer is copied into one owned snapshot, which is used for
 * public-key derivation and signing. The caller's buffer is zeroed before this
 * function returns or throws.
 *
 * @param consumePrivateKey - Private key to consume. Zeroed before this function returns or throws.
 * @param derivePublicKey - Derives the public key from the owned private-key snapshot; a throw doubles as private-key validation.
 * @returns The {@link LockableKey} handle gating access on lock state, paired with the derived public key.
 * @remarks Side effects: zeroes `consumePrivateKey` on every path; the owned snapshot is zeroed by `lock()` on success or before rethrowing a validation failure.
 * @throws Rethrows whatever `derivePublicKey` throws, after zeroing the owned snapshot and `consumePrivateKey`.
 */
function createSigningKey(
  consumePrivateKey: Uint8Array,
  derivePublicKey: (privateKey: Uint8Array) => Uint8Array,
): { key: LockableKey; publicKey: Uint8Array } {
  let activePrivateKey: Uint8Array | undefined;

  try {
    // Derive and store from the same owned snapshot, so the public key cannot
    // diverge from the private key later used for signing.
    activePrivateKey = copyBytes(consumePrivateKey);
    const publicKey = derivePublicKey(activePrivateKey);

    const key: LockableKey = {
      use(): Uint8Array {
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
function requireUnlocked(privateKey: Uint8Array | undefined): Uint8Array {
  if (privateKey === undefined) {
    throw new MeraError("SESSION_LOCKED", "Signing session is locked");
  }

  return privateKey;
}

export { createSigningKey };
