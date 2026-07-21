import { MeraError } from "./errors.js";

/**
 * Returns cryptographically random bytes from Web Crypto.
 *
 * @param length - Number of random bytes to return.
 * @returns Cryptographically random bytes.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 */
function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(length);
  getCrypto().getRandomValues(output);
  return output;
}

/**
 * Returns the host Web Crypto implementation.
 *
 * @returns `globalThis.crypto` when Web Crypto is available.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 */
function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new MeraError("CRYPTO_UNAVAILABLE", "Web Crypto is unavailable");
  }

  return globalThis.crypto;
}

export { getCrypto, randomBytes };
