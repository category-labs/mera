import { hexToBytes } from "@noble/hashes/utils.js";
import { expect } from "@playwright/test";
import type { WebAuthnClient } from "../dist/webauthn.js";

// sha256("mera.prf.salt.v1"): the fixed default salt documented on
// getPasskeyPrfOutput.
const DEFAULT_PRF_SALT = hexToBytes(
  "896d46ac4ac191885c46137439db7bb52fb05cff3ecd34af7cdae0a1e0c00db9",
);

const SEQUENCE_PRF_OUTPUT = Uint8Array.from({ length: 32 }, (_, i) => i);

const CREDENTIAL_ID_BYTES = new Uint8Array([1, 2, 3, 4]);
const CREDENTIAL_ID_BASE64URL = "AQIDBA";

const rp = { id: "example.com", name: "Mera Test" };
const user = { name: "nad", displayName: "nad" };

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
  expect(fn).toThrow(expect.objectContaining({ code }));
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

// Forwards Web Crypto unchanged while recording the randomness requested by fn.
async function withCountedRandomness<T>(
  fn: () => T | Promise<T>,
): Promise<{ result: T; calls: number; bytesDrawn: number }> {
  const crypto = globalThis.crypto;
  let calls = 0;
  let bytesDrawn = 0;
  const countingCrypto = {
    subtle: crypto.subtle,
    getRandomValues(array: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
      calls += 1;
      bytesDrawn += array.byteLength;
      return crypto.getRandomValues(array);
    },
  };

  const result = await withStubbedGlobal("crypto", countingCrypto, fn);
  return { result, calls, bytesDrawn };
}

type ClientCalls = {
  create: Parameters<WebAuthnClient["createCredential"]>[0][];
  get: Parameters<WebAuthnClient["getCredential"]>[0][];
};

// WebAuthnClient stub that records every request. Unless `getPrfOutput` says
// otherwise, an assertion's PRF output is a copy of the salt it evaluated.
function stubClient(
  answers: {
    prfEnabled?: boolean;
    createPrfOutput?: Uint8Array;
    getPrfOutput?: (prfSalt: Uint8Array) => Uint8Array | undefined;
    createError?: Error;
    getError?: Error;
  } = {},
): { client: WebAuthnClient; calls: ClientCalls } {
  const calls: ClientCalls = { create: [], get: [] };
  const getPrfOutput =
    answers.getPrfOutput ?? ((prfSalt) => new Uint8Array(prfSalt));

  const client: WebAuthnClient = {
    async createCredential(request) {
      calls.create.push(request);
      if (answers.createError !== undefined) {
        throw answers.createError;
      }

      return {
        credentialId: new Uint8Array(CREDENTIAL_ID_BYTES),
        transports: ["internal"],
        prfEnabled: answers.prfEnabled ?? true,
        prfOutput: answers.createPrfOutput,
      };
    },
    async getCredential(request) {
      calls.get.push(request);
      if (answers.getError !== undefined) {
        throw answers.getError;
      }

      return {
        credentialId: new Uint8Array(CREDENTIAL_ID_BYTES),
        prfOutput: getPrfOutput(request.prfSalt),
      };
    },
  };

  return { client, calls };
}

// Records each PRF output client.getCredential returns while fn runs. The
// method is patched in place because a wrapper would be a custom client, whose
// PRF output the passkey functions leave as returned.
async function withRecordedPrfOutputs<T>(
  client: WebAuthnClient,
  fn: () => T | Promise<T>,
): Promise<{ result: T; prfOutputs: Uint8Array[] }> {
  const { getCredential } = client;
  const prfOutputs: Uint8Array[] = [];
  const recordingGetCredential: WebAuthnClient["getCredential"] = async (
    request,
  ) => {
    const asserted = await getCredential(request);
    if (asserted.prfOutput !== undefined) {
      prfOutputs.push(asserted.prfOutput);
    }
    return asserted;
  };

  Object.assign(client, { getCredential: recordingGetCredential });
  try {
    return { result: await fn(), prfOutputs };
  } finally {
    Object.assign(client, { getCredential });
  }
}

export {
  CREDENTIAL_ID_BASE64URL,
  CREDENTIAL_ID_BYTES,
  DEFAULT_PRF_SALT,
  expectError,
  readEvaluatedPrfSalt,
  rp,
  SEQUENCE_PRF_OUTPUT,
  stubClient,
  stubPublicKeyCredential,
  user,
  withCountedRandomness,
  withRecordedPrfOutputs,
  withStubbedGlobal,
};
