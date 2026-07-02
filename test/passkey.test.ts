import { expect, test } from "@playwright/test";
import { copyPrfOutput, createPasskeyWithPrfOutput } from "../dist/passkey.js";
import { expectError } from "./helpers.js";

const ORIGINAL_NAVIGATOR = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);

test("copyPrfOutput copies a plain ArrayBuffer without aliasing", () => {
  const source = new Uint8Array([1, 2, 3, 4]);
  const out = copyPrfOutput(source.buffer);

  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual([1, 2, 3, 4]);

  // Mutating the source buffer must not affect the copy.
  new Uint8Array(source.buffer)[0] = 99;
  expect(out[0]).toBe(1);
});

test("copyPrfOutput copies only an ArrayBufferView's window without aliasing", () => {
  // A 4-byte view sitting in the middle of an 8-byte buffer.
  const { buffer } = new Uint8Array([0, 0, 5, 6, 7, 8, 0, 0]);
  const view = new Uint8Array(buffer, 2, 4);
  const out = copyPrfOutput(view);

  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual([5, 6, 7, 8]);

  // Mutating the underlying buffer must not affect the copy.
  new Uint8Array(buffer)[2] = 99;
  expect(out[0]).toBe(5);
});

test("copyPrfOutput copies a plain array of byte values", () => {
  // The 1Password browser extension returns PRF output as a plain number array.
  const out = copyPrfOutput([10, 20, 30]);

  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual([10, 20, 30]);
});

test("copyPrfOutput accepts the boundary byte values 0 and 255", () => {
  expect([...copyPrfOutput([0, 255])]).toEqual([0, 255]);
});

test("copyPrfOutput rejects non-byte array values instead of coercing them", () => {
  // Uint8Array.from would silently coerce each of these (256 -> 0, -1 -> 255,
  // 1.5 -> 1, NaN -> 0). The result becomes HKDF key material, so a malformed
  // plain array must fail with PRF_UNAVAILABLE instead.
  expectError(() => copyPrfOutput([256]), "PRF_UNAVAILABLE");
  expectError(() => copyPrfOutput([-1]), "PRF_UNAVAILABLE");
  expectError(() => copyPrfOutput([1.5]), "PRF_UNAVAILABLE");
  expectError(() => copyPrfOutput([Number.NaN]), "PRF_UNAVAILABLE");
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
