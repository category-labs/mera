import { asArrayBuffer } from "./encoding.js";
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

/**
 * Derives a non-extractable AES-256-GCM key with HKDF-SHA-256 and an empty salt.
 *
 * @param ikm - Input keying material.
 * @param info - HKDF info/context bytes; domain-separates keys derived from the same `ikm`.
 * @returns A non-extractable AES-GCM `CryptoKey` usable for encryption and decryption.
 * @remarks
 * `ikm` and `info` are copied into standalone buffers synchronously, before
 * the first `await`, so mutating either input after the call starts does not
 * affect the derived key. Public copy guarantees (`decryptSecretVault`'s
 * `prfOutput` remark) rest on this ordering; the copies must stay ahead of
 * every `await`.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 */
async function hkdfSha256AesGcmKey(
  ikm: Uint8Array,
  info: Uint8Array,
): Promise<CryptoKey> {
  const crypto = getCrypto();
  const material = await crypto.subtle.importKey(
    "raw",
    asArrayBuffer(ikm),
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: asArrayBuffer(info),
    },
    material,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
}

export { getCrypto, hkdfSha256AesGcmKey, randomBytes };
