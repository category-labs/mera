import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { copyBytes } from "./encoding.js";
import { PasskeyAccountError } from "./errors.js";
import { createSigningKey } from "./session.js";
import type {
  CreateSigningSessionOptions,
  Ed25519SigningSession,
} from "./types.js";

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
 * @param options.consumePrivateKey - Ed25519 seed. Must be 32 bytes. Copied into one session-owned snapshot, then zeroed before this call returns or throws.
 * @returns An unlocked Ed25519 signing session.
 * @remarks `consumePrivateKey` is zeroed on every path; public-key derivation and later signing use one session-owned copy, which `lock()` later zeroes.
 * @throws PasskeyAccountError with code `INPUT_INVALID` when `consumePrivateKey` is not 32 bytes.
 */
function createEd25519SigningSession({
  consumePrivateKey,
}: CreateSigningSessionOptions): Ed25519SigningSession {
  const { key, publicKey } = createSigningKey(
    consumePrivateKey,
    getEd25519PublicKey,
  );

  return {
    publicKey,
    async signMessage(message: Uint8Array): Promise<Uint8Array> {
      // Signing reads the buffer after an await; copy it now so a later mutation can't change the signed bytes.
      const messageCopy = copyBytes(message);
      return new Uint8Array(await ed25519.signAsync(messageCopy, key.use()));
    },
    lock(): void {
      key.lock();
    },
  };
}

export { createEd25519SigningSession, getEd25519PublicKey };
