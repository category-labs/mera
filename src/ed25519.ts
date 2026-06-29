import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { PasskeyAccountError } from "./errors.js";
import { createLockableKey } from "./session.js";
import type {
  CreateSigningSessionOptions,
  Ed25519SigningSession,
} from "./types.js";
import { copyBytes } from "./encoding.js";

/**
 * Derives the 32-byte Ed25519 public key for a 32-byte Ed25519 seed.
 *
 * @internal
 * @param privateKey - A 32-byte Ed25519 seed.
 * @returns The 32-byte Ed25519 public key.
 * @throws PasskeyAccountError with code `INPUT_INVALID` when `privateKey` is not 32 bytes.
 */
function getEd25519PublicKey(privateKey: Uint8Array): Uint8Array {
  if (privateKey.length !== 32) {
    throw new PasskeyAccountError(
      "INPUT_INVALID",
      "Ed25519 private key must be 32 bytes",
    );
  }

  // noble's sync API ships without SHA-512; wire it on first sync use rather
  // than at module load, so this module has no import-time side effect.
  ed25519.hashes.sha512 ??= sha512;
  return new Uint8Array(ed25519.getPublicKey(privateKey));
}

/**
 * Wraps an Ed25519 seed in an explicitly lockable signing session.
 *
 * `signMessage` signs the raw message bytes with Ed25519 (Ed25519pure); the curve hashes internally with SHA-512.
 *
 * @param options - Signing session inputs.
 * @param options.consumePrivateKey - Ed25519 seed. Must be 32 bytes. The session takes ownership: the caller's buffer is zeroed once the session has copied the bytes.
 * @returns An unlocked Ed25519 signing session.
 * @remarks Side effects: copies `consumePrivateKey` into session memory and then zeroes the caller's buffer; `lock()` later zeroes the session-owned copy.
 * @throws PasskeyAccountError with code `INPUT_INVALID` when `consumePrivateKey` is not 32 bytes.
 */
function createEd25519SigningSession({
  consumePrivateKey,
}: CreateSigningSessionOptions): Ed25519SigningSession {
  const publicKey = getEd25519PublicKey(consumePrivateKey);
  const key = createLockableKey(consumePrivateKey);

  return {
    publicKey,
    async signMessage(message: Uint8Array): Promise<Uint8Array> {
      // Copy the message before async work so the buffer cannot be modified before signing.
      const messageCopy = copyBytes(message);
      return new Uint8Array(await ed25519.signAsync(messageCopy, key.use()));
    },
    exportPrivateKey(): Uint8Array {
      return key.exportCopy();
    },
    lock(): void {
      key.lock();
    },
  };
}

export { createEd25519SigningSession, getEd25519PublicKey };
