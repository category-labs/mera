import { MeraError } from "./errors.js";

/**
 * Returns cryptographically random bytes from the runtime's CSPRNG.
 *
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when `crypto.getRandomValues` is unavailable.
 * @internal
 */
function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const crypto = globalThis.crypto;

  if (!crypto?.getRandomValues) {
    throw new MeraError(
      "CRYPTO_UNAVAILABLE",
      "crypto.getRandomValues is unavailable",
    );
  }

  const output = new Uint8Array(length);
  crypto.getRandomValues(output);
  return output;
}

/**
 * Returns the host `SubtleCrypto` implementation.
 *
 * Separate from {@link randomBytes} because the passkey and signing APIs need
 * only `crypto.getRandomValues`, and a runtime can provide that without
 * `crypto.subtle`.
 *
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when `crypto.subtle` is unavailable.
 * @internal
 */
function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    throw new MeraError("CRYPTO_UNAVAILABLE", "crypto.subtle is unavailable");
  }

  return subtle;
}

export { getSubtleCrypto, randomBytes };
