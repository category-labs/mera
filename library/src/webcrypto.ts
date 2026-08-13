import { MeraError } from "./errors.js";

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

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    throw new MeraError("CRYPTO_UNAVAILABLE", "crypto.subtle is unavailable");
  }

  return subtle;
}

export { getSubtleCrypto, randomBytes };
