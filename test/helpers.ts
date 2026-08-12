import { hexToBytes } from "@noble/hashes/utils.js";
import { expect } from "@playwright/test";

// sha256("mera.prf.salt.v1"): the fixed default salt documented on
// getPasskeyPrfOutput.
const DEFAULT_PRF_SALT = hexToBytes(
  "896d46ac4ac191885c46137439db7bb52fb05cff3ecd34af7cdae0a1e0c00db9",
);

const CREDENTIAL_ID_BYTES = new Uint8Array([1, 2, 3, 4]);
const CREDENTIAL_ID_BASE64URL = "AQIDBA";

// WebAuthn credential stub for navigator.credentials fakes: `prf` becomes the
// client extension results, and `transports` adds a create-style response
// implementing getTransports (otherwise the response is empty, as it is after
// sign-in).
function stubPublicKeyCredential({
  prf,
  transports,
}: {
  prf: unknown;
  transports?: string[];
}) {
  return {
    type: "public-key",
    rawId: new Uint8Array(CREDENTIAL_ID_BYTES).buffer,
    response:
      transports !== undefined ? { getTransports: () => transports } : {},
    getClientExtensionResults: () => ({ prf }),
  };
}

// Reads the PRF salt a stubbed WebAuthn call was asked to evaluate. The salt
// arrives as the library's own live buffer, so the read is a copy: a caller
// that mutates a returned prfSalt must not change what a stub already recorded.
function readEvaluatedPrfSalt(
  publicKey:
    | PublicKeyCredentialRequestOptions
    | PublicKeyCredentialCreationOptions
    | undefined,
): Uint8Array<ArrayBuffer> {
  const first = publicKey?.extensions?.prf?.eval?.first;
  if (!(first instanceof Uint8Array)) {
    throw new Error("expected PRF salt as a Uint8Array");
  }
  return new Uint8Array(first);
}

function expectError(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return;
  }

  throw new Error(`expected fn to throw with code ${code}`);
}

// Replaces a globalThis property for the duration of fn, then restores the
// original property descriptor (or deletes the property if it did not exist).
async function withStubbedGlobal<T>(
  name: string,
  value: unknown,
  fn: () => T | Promise<T>,
): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });

  try {
    return await fn();
  } finally {
    if (original) {
      Object.defineProperty(globalThis, name, original);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  }
}

export {
  CREDENTIAL_ID_BASE64URL,
  CREDENTIAL_ID_BYTES,
  DEFAULT_PRF_SALT,
  expectError,
  readEvaluatedPrfSalt,
  stubPublicKeyCredential,
  withStubbedGlobal,
};
