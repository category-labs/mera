import { asArrayBuffer } from "./encoding.js";
import { MeraError } from "./errors.js";

/**
 * Returns `length` cryptographically random bytes from Web Crypto.
 *
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when Web Crypto is unavailable.
 */
function randomBytes(length: number): Uint8Array {
  const output = new Uint8Array(length);
  getCrypto().getRandomValues(output);
  return output;
}

/**
 * Returns the host Web Crypto implementation.
 *
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when Web Crypto is unavailable.
 */
function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) {
    throw new MeraError(
      "PASSKEY_OPERATION_FAILED",
      "Web Crypto is unavailable",
    );
  }

  return globalThis.crypto;
}

/**
 * Derives a non-extractable AES-256-GCM key with HKDF-SHA-256 and an empty salt.
 *
 * `info` domain-separates keys derived from the same input keying material `ikm`.
 *
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when Web Crypto is unavailable.
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
