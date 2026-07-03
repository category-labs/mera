import { expect, test } from "@playwright/test";
import {
  copyPrfOutput,
  createPasskey,
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
} from "../dist/passkey.js";
import { expectError } from "./helpers.js";

const ORIGINAL_NAVIGATOR = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);
const ORIGINAL_CRYPTO = Object.getOwnPropertyDescriptor(globalThis, "crypto");

function restoreGlobalCrypto(): void {
  if (ORIGINAL_CRYPTO) {
    Object.defineProperty(globalThis, "crypto", ORIGINAL_CRYPTO);
  } else {
    Reflect.deleteProperty(globalThis, "crypto");
  }
}

test("copyPrfOutput copies a plain ArrayBuffer without aliasing", () => {
  const source = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const out = copyPrfOutput(source.buffer);

  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual([...source]);

  // Mutating the source buffer must not affect the copy.
  source[0] = 99;
  expect(out[0]).toBe(1);
});

test("copyPrfOutput copies only an ArrayBufferView's window without aliasing", () => {
  // A 32-byte view sitting in the middle of a 40-byte buffer.
  const backing = new Uint8Array(40);
  backing.set(
    Uint8Array.from({ length: 32 }, (_, index) => index + 1),
    4,
  );
  const view = new Uint8Array(backing.buffer, 4, 32);
  const out = copyPrfOutput(view);

  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual([...view]);

  // Mutating the underlying buffer must not affect the copy.
  backing[4] = 99;
  expect(out[0]).toBe(1);
});

test("copyPrfOutput copies a plain array of byte values", () => {
  // The 1Password browser extension returns PRF output as a plain number
  // array. Includes the boundary values 0 and 255, which must stay uncoerced.
  const values = Array.from({ length: 32 }, (_, index) => index);
  values[31] = 255;
  const out = copyPrfOutput(values);

  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual(values);
});

test("copyPrfOutput rejects non-byte array values instead of coercing them", () => {
  // Uint8Array.from would silently coerce each of these (256 -> 0, -1 -> 255,
  // 1.5 -> 1, NaN -> 0). The result becomes HKDF key material, so a malformed
  // plain array must fail with PRF_UNAVAILABLE instead.
  const withFirstValue = (value: number) => [value, ...new Array(31).fill(0)];

  expectError(() => copyPrfOutput(withFirstValue(256)), "PRF_UNAVAILABLE");
  expectError(() => copyPrfOutput(withFirstValue(-1)), "PRF_UNAVAILABLE");
  expectError(() => copyPrfOutput(withFirstValue(1.5)), "PRF_UNAVAILABLE");
  expectError(
    () => copyPrfOutput(withFirstValue(Number.NaN)),
    "PRF_UNAVAILABLE",
  );
});

test("copyPrfOutput rejects PRF output that is not 32 bytes", () => {
  expectError(() => copyPrfOutput(new Uint8Array(31)), "PRF_UNAVAILABLE");
  expectError(() => copyPrfOutput(new ArrayBuffer(33)), "PRF_UNAVAILABLE");
  // Valid byte values, so a plain array fails on length, not element checks.
  expectError(() => copyPrfOutput([1, 2, 3]), "PRF_UNAVAILABLE");
});

test("passkey helpers report CRYPTO_UNAVAILABLE when Web Crypto is unavailable", async () => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: undefined,
  });

  try {
    const user = { name: "nad", displayName: "nad" };
    const prfSalt = new Uint8Array(32);

    await expect(
      createPasskey({
        rp: { id: "example.com", name: "Mera Test" },
        user,
        prfSalt,
      }),
    ).rejects.toMatchObject({ code: "CRYPTO_UNAVAILABLE" });

    await expect(
      getPasskeyPrfOutput({
        rpId: "example.com",
        prfSalt,
      }),
    ).rejects.toMatchObject({ code: "CRYPTO_UNAVAILABLE" });

    await expect(
      createPasskeyWithPrfOutput({
        rp: { id: "example.com", name: "Mera Test" },
        user,
        prfSalt,
      }),
    ).rejects.toMatchObject({ code: "CRYPTO_UNAVAILABLE" });
  } finally {
    restoreGlobalCrypto();
  }
});

test("getPasskeyPrfOutput rejects an empty credentialId without prompting", async () => {
  // A malformed stored ID must fail closed instead of silently widening the
  // assertion to any discoverable credential for the relying party.
  let asserted = false;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      credentials: {
        async get() {
          asserted = true;
          throw new Error("assertion must not start");
        },
      },
    },
  });

  try {
    await expect(
      getPasskeyPrfOutput({
        rpId: "example.com",
        credentialId: "",
        prfSalt: new Uint8Array(32),
      }),
    ).rejects.toMatchObject({ code: "INPUT_INVALID" });
    expect(asserted).toBe(false);
  } finally {
    if (ORIGINAL_NAVIGATOR) {
      Object.defineProperty(globalThis, "navigator", ORIGINAL_NAVIGATOR);
    } else {
      Reflect.deleteProperty(globalThis, "navigator");
    }
  }
});

test("createPasskeyWithPrfOutput snapshots prfSalt for fallback and result", async () => {
  const originalSalt = Uint8Array.from({ length: 32 }, (_, index) => index);
  const prfSalt = new Uint8Array(originalSalt);
  let fallbackSalt: Uint8Array | undefined;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      credentials: {
        async create() {
          await Promise.resolve();
          return {
            type: "public-key",
            rawId: new Uint8Array([1, 2, 3, 4]).buffer,
            response: {
              getTransports: () => ["internal"],
            },
            getClientExtensionResults: () => ({ prf: { enabled: true } }),
          };
        },
        async get({ publicKey }: CredentialRequestOptions) {
          const first = publicKey?.extensions?.prf?.eval?.first;
          if (!(first instanceof ArrayBuffer)) {
            throw new Error("expected fallback PRF salt");
          }

          fallbackSalt = new Uint8Array(first);
          return {
            type: "public-key",
            rawId: new Uint8Array([1, 2, 3, 4]).buffer,
            getClientExtensionResults: () => ({
              prf: { results: { first } },
            }),
          };
        },
      },
    },
  });

  try {
    const pending = createPasskeyWithPrfOutput({
      rp: { id: "example.com", name: "Mera Test" },
      user: {
        id: new Uint8Array([1]),
        name: "nad",
        displayName: "nad",
      },
      prfSalt,
    });

    prfSalt.fill(255);

    const result = await pending;

    expect(result.prfSalt).toEqual(originalSalt);
    expect(result.prfOutput).toEqual(originalSalt);
    expect(fallbackSalt).toEqual(originalSalt);
  } finally {
    if (ORIGINAL_NAVIGATOR) {
      Object.defineProperty(globalThis, "navigator", ORIGINAL_NAVIGATOR);
    } else {
      Reflect.deleteProperty(globalThis, "navigator");
    }
  }
});
