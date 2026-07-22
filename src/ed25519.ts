import { ed25519 } from "@noble/curves/ed25519.js";
import { MeraError } from "./errors.js";
import { createSigningKey } from "./session.js";
import type {
  CreateSigningSessionOptions,
  Ed25519SigningSession,
} from "./types.js";

/**
 * Derives the 32-byte Ed25519 public key for a 32-byte Ed25519 private key.
 *
 * @param privateKey - A 32-byte Ed25519 private key (the seed).
 * @returns The 32-byte Ed25519 public key.
 * @throws MeraError with code `INPUT_INVALID` when `privateKey` is not 32 bytes.
 * @internal
 */
function getEd25519PublicKey(privateKey: Uint8Array): Uint8Array<ArrayBuffer> {
  if (privateKey.length !== 32) {
    throw new MeraError(
      "INPUT_INVALID",
      "Ed25519 private key must be 32 bytes",
    );
  }

  return new Uint8Array(ed25519.getPublicKey(privateKey));
}

/**
 * Creates a signing session from an Ed25519 private key.
 *
 * @param options - Signing session inputs; fields are documented on {@link CreateSigningSessionOptions}.
 * @returns A live Ed25519 signing session.
 * @throws MeraError with code `INPUT_INVALID` when `privateKey` is not 32 bytes.
 */
function createEd25519SigningSession({
  privateKey,
}: CreateSigningSessionOptions): Ed25519SigningSession {
  const { use, end, publicKey } = createSigningKey(
    privateKey,
    getEd25519PublicKey,
  );

  return {
    publicKey,
    async signMessage(message: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
      return new Uint8Array(ed25519.sign(message, use()));
    },
    end,
    [Symbol.dispose]: end,
  };
}

export { createEd25519SigningSession };
