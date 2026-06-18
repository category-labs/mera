import { copyBytes } from "./encoding.js";
import { requireUnlocked } from "./errors.js";

/**
 * Handle to a session-owned private key whose lifetime is gated by `lock`.
 *
 * Centralizes the key-zeroing lifecycle shared by every signing session: the
 * caller's buffer is consumed (copied, then zeroed) on creation, access throws
 * once locked, and `lock` zeroes the session-owned copy.
 */
type LockableKey = {
  /**
   * Returns the live session-owned key for immediate use.
   *
   * @throws PasskeyAccountError with code `SESSION_LOCKED` after `lock` has been called.
   */
  use(): Uint8Array;
  /**
   * Returns a fresh copy of the session-owned key.
   *
   * @throws PasskeyAccountError with code `SESSION_LOCKED` after `lock` has been called.
   */
  exportCopy(): Uint8Array;
  /** Zeroes the session-owned key and permanently locks this handle. */
  lock(): void;
};

/**
 * Copies a private key into session-owned memory and zeroes the caller's buffer.
 *
 * @param consumePrivateKey - Private key the session takes ownership of. Zeroed once copied.
 * @returns A {@link LockableKey} gating access on lock state.
 * @remarks Side effects: copies `consumePrivateKey` into session memory and then zeroes the caller's buffer.
 */
function createLockableKey(consumePrivateKey: Uint8Array): LockableKey {
  let activePrivateKey: Uint8Array | undefined = copyBytes(consumePrivateKey);
  consumePrivateKey.fill(0);

  return {
    use(): Uint8Array {
      return requireUnlocked(activePrivateKey);
    },
    exportCopy(): Uint8Array {
      return new Uint8Array(requireUnlocked(activePrivateKey));
    },
    lock(): void {
      if (activePrivateKey !== undefined) {
        activePrivateKey.fill(0);
        activePrivateKey = undefined;
      }
    },
  };
}

export type { LockableKey };
export { createLockableKey };
