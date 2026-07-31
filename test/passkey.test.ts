import { expect, test } from "@playwright/test";
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
} from "../dist/passkey.js";
import {
  DEFAULT_PRF_SALT,
  readEvaluatedPrfSalt,
  stubPublicKeyCredential,
  withStubbedGlobal,
} from "./helpers.js";

// Stubs an assertion whose authenticator returns `first` as the PRF result.
function navigatorWithPrfResult(first: unknown) {
  return {
    credentials: {
      async get() {
        return stubPublicKeyCredential({ prf: { results: { first } } });
      },
    },
  };
}

async function getPrfOutputWithStub(first: unknown): Promise<Uint8Array> {
  return withStubbedGlobal(
    "navigator",
    navigatorWithPrfResult(first),
    async () => {
      const { prfOutput } = await getPasskeyPrfOutput({
        rpId: "example.com",
        prfSalt: new Uint8Array(32),
      });
      return prfOutput;
    },
  );
}

test("getPasskeyPrfOutput copies an ArrayBuffer PRF result without aliasing", async () => {
  const source = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const out = await getPrfOutputWithStub(source.buffer);

  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual([...source]);

  // Mutating the source buffer must not affect the returned output.
  source[0] = 99;
  expect(out[0]).toBe(1);
});

test("getPasskeyPrfOutput copies only an ArrayBufferView's window without aliasing", async () => {
  // A 32-byte view sitting in the middle of a 40-byte buffer.
  const backing = new Uint8Array(40);
  backing.set(
    Uint8Array.from({ length: 32 }, (_, index) => index + 1),
    4,
  );
  const view = new Uint8Array(backing.buffer, 4, 32);
  const out = await getPrfOutputWithStub(view);

  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual([...view]);

  // Mutating the underlying buffer must not affect the returned output.
  backing[4] = 99;
  expect(out[0]).toBe(1);
});

test("getPasskeyPrfOutput copies a plain array of byte values", async () => {
  // The 1Password browser extension returns PRF output as a plain number
  // array. Includes the boundary values 0 and 255, which must stay uncoerced.
  const values = Array.from({ length: 32 }, (_, index) => index);
  values[31] = 255;
  const out = await getPrfOutputWithStub(values);

  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual(values);
});

test("getPasskeyPrfOutput rejects non-byte array values instead of coercing them", async () => {
  // Uint8Array.from would silently coerce each of these (256 -> 0, -1 -> 255,
  // 1.5 -> 1, NaN -> 0). The result becomes HKDF key material, so a malformed
  // plain array must fail with PRF_UNAVAILABLE instead.
  for (const value of [256, -1, 1.5, Number.NaN]) {
    await expect(
      getPrfOutputWithStub([value, ...new Array(31).fill(0)]),
    ).rejects.toMatchObject({ code: "PRF_UNAVAILABLE" });
  }
});

test("getPasskeyPrfOutput rejects PRF output that is not 32 bytes", async () => {
  await expect(getPrfOutputWithStub(new Uint8Array(31))).rejects.toMatchObject({
    code: "PRF_UNAVAILABLE",
  });
  await expect(getPrfOutputWithStub(new ArrayBuffer(33))).rejects.toMatchObject(
    { code: "PRF_UNAVAILABLE" },
  );
  // Valid byte values, so a plain array fails on length, not element checks.
  await expect(getPrfOutputWithStub([1, 2, 3])).rejects.toMatchObject({
    code: "PRF_UNAVAILABLE",
  });
});

test("PRF output helpers default to Mera's fixed salt", async () => {
  const evaluatedSalts: Uint8Array[] = [];

  const navigator = {
    credentials: {
      async create({ publicKey }: CredentialCreationOptions) {
        evaluatedSalts.push(readEvaluatedPrfSalt(publicKey));
        return stubPublicKeyCredential({ prf: { enabled: true } });
      },
      async get({ publicKey }: CredentialRequestOptions) {
        const salt = readEvaluatedPrfSalt(publicKey);
        evaluatedSalts.push(salt);
        return stubPublicKeyCredential({
          prf: { results: { first: salt.buffer } },
        });
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    const expected = DEFAULT_PRF_SALT;
    const created = await createPasskeyWithPrfOutput({
      rp: { id: "example.com", name: "Mera Test" },
      user: { name: "nad", displayName: "nad" },
    });
    expect(created.prfSalt).toEqual(expected);
    expect(created.prfOutput).toEqual(expected);

    created.prfSalt.fill(255);

    const recreated = await createPasskeyWithPrfOutput({
      rp: { id: "example.com", name: "Mera Test" },
      user: { name: "nad", displayName: "nad" },
    });
    expect(recreated.prfSalt).toEqual(expected);

    const asserted = await getPasskeyPrfOutput({ rpId: "example.com" });
    expect(asserted.prfOutput).toEqual(expected);
  });

  expect(evaluatedSalts).toHaveLength(5);
  for (const salt of evaluatedSalts) {
    expect(salt).toEqual(DEFAULT_PRF_SALT);
  }
});

test("PRF output helpers reject an explicit salt of the wrong length", async () => {
  let prompted = false;
  const navigator = {
    credentials: {
      async create() {
        prompted = true;
        throw new Error("creation must not start");
      },
      async get() {
        prompted = true;
        throw new Error("assertion must not start");
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    await expect(
      createPasskeyWithPrfOutput({
        rp: { id: "example.com", name: "Mera Test" },
        user: { name: "nad", displayName: "nad" },
        prfSalt: new Uint8Array(31),
      }),
    ).rejects.toMatchObject({ code: "INPUT_INVALID" });

    await expect(
      getPasskeyPrfOutput({
        rpId: "example.com",
        prfSalt: new Uint8Array(31),
      }),
    ).rejects.toMatchObject({ code: "INPUT_INVALID" });
  });

  expect(prompted).toBe(false);
});

test("passkey helpers report CRYPTO_UNAVAILABLE when Web Crypto is unavailable", async () => {
  // WebAuthn availability is checked before Web Crypto, so a credentials stub
  // must be present for the crypto failure to be reachable.
  await withStubbedGlobal("navigator", { credentials: {} }, async () => {
    await withStubbedGlobal("crypto", undefined, async () => {
      const user = { name: "nad", displayName: "nad" };
      const prfSalt = new Uint8Array(32);

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
    });
  });
});

test("passkey helpers generate internal challenges and request no attestation", async () => {
  let createOptions: PublicKeyCredentialCreationOptions | undefined;
  let getOptions: PublicKeyCredentialRequestOptions | undefined;

  const navigator = {
    credentials: {
      async create({ publicKey }: CredentialCreationOptions) {
        createOptions = publicKey;
        return stubPublicKeyCredential({
          prf: {
            enabled: true,
            results: { first: new Uint8Array(32).buffer },
          },
          transports: ["internal"],
        });
      },
      async get({ publicKey }: CredentialRequestOptions) {
        getOptions = publicKey;
        return stubPublicKeyCredential({
          prf: { results: { first: new Uint8Array(32).buffer } },
        });
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    await createPasskeyWithPrfOutput({
      rp: { id: "example.com", name: "Mera Test" },
      user: { name: "nad", displayName: "nad" },
      prfSalt: new Uint8Array(32),
    });
    await getPasskeyPrfOutput({
      rpId: "example.com",
      prfSalt: new Uint8Array(32),
    });
  });

  if (createOptions === undefined || getOptions === undefined) {
    throw new Error("expected WebAuthn options to be captured");
  }

  expect(createOptions.challenge).toBeInstanceOf(ArrayBuffer);
  expect(new Uint8Array(createOptions.challenge as ArrayBuffer)).toHaveLength(
    32,
  );
  expect(createOptions.attestation).toBe("none");
  expect(getOptions.challenge).toBeInstanceOf(ArrayBuffer);
  expect(new Uint8Array(getOptions.challenge as ArrayBuffer)).toHaveLength(32);
});

test("createPasskeyWithPrfOutput generates a fresh user handle per call", async () => {
  // The handle never reaches the caller, so the WebAuthn options are the only
  // place it is observable. A repeated handle would make the second call
  // overwrite the passkey the first one created.
  const handles: Uint8Array[] = [];

  const navigator = {
    credentials: {
      async create({ publicKey }: CredentialCreationOptions) {
        handles.push(new Uint8Array(publicKey?.user.id as ArrayBuffer));
        return stubPublicKeyCredential({
          prf: {
            enabled: true,
            results: { first: new Uint8Array(32).buffer },
          },
          transports: ["internal"],
        });
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    const options = {
      rp: { id: "example.com", name: "Mera Test" },
      user: { name: "nad", displayName: "nad" },
    };
    await createPasskeyWithPrfOutput(options);
    await createPasskeyWithPrfOutput(options);
  });

  expect(handles[0]).toHaveLength(32);
  expect(handles[1]).toHaveLength(32);
  expect(handles[0]).not.toEqual(handles[1]);
});

test("getPasskeyPrfOutput rejects an empty credentialId without prompting", async () => {
  // A malformed stored ID must fail closed instead of silently widening the
  // assertion to any discoverable credential for the relying party.
  let asserted = false;

  const navigator = {
    credentials: {
      async get() {
        asserted = true;
        throw new Error("assertion must not start");
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    await expect(
      getPasskeyPrfOutput({
        rpId: "example.com",
        credential: { credentialId: "" },
        prfSalt: new Uint8Array(32),
      }),
    ).rejects.toMatchObject({ code: "INPUT_INVALID" });
    expect(asserted).toBe(false);
  });
});

test("a using declaration zeroes the PRF output when its scope exits", async () => {
  const expected = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const navigator = {
    credentials: {
      async create() {
        return stubPublicKeyCredential({
          prf: { enabled: true, results: { first: expected.buffer } },
          transports: ["internal"],
        });
      },
      async get() {
        return stubPublicKeyCredential({
          prf: { results: { first: expected.buffer } },
        });
      },
    },
  };

  // Distinct from the PRF output, and non-zero so the surviving-salt assertion
  // below cannot pass by accident.
  const salt = Uint8Array.from({ length: 32 }, (_, index) => index + 100);

  await withStubbedGlobal("navigator", navigator, async () => {
    let assertedOutput: Uint8Array | undefined;
    let createdOutput: Uint8Array | undefined;
    let createdSalt: Uint8Array | undefined;

    {
      using asserted = await getPasskeyPrfOutput({
        rpId: "example.com",
        prfSalt: salt,
      });
      using created = await createPasskeyWithPrfOutput({
        rp: { id: "example.com", name: "Mera Test" },
        user: { name: "nad", displayName: "nad" },
        prfSalt: salt,
      });

      assertedOutput = asserted.prfOutput;
      createdOutput = created.prfOutput;
      createdSalt = created.prfSalt;

      expect(assertedOutput).toEqual(expected);
      expect(createdOutput).toEqual(expected);
    }

    expect(assertedOutput).toEqual(new Uint8Array(32));
    expect(createdOutput).toEqual(new Uint8Array(32));
    // A vault stores the salt, so disposal must leave it readable.
    expect(createdSalt).toEqual(salt);
    // The authenticator's own buffer is upstream of the copy and untouched.
    expect(expected[0]).toBe(1);
  });
});

test("createPasskeyWithPrfOutput snapshots prfSalt for fallback and result", async () => {
  const originalSalt = Uint8Array.from({ length: 32 }, (_, index) => index);
  const prfSalt = new Uint8Array(originalSalt);
  let fallbackSalt: Uint8Array | undefined;

  const navigator = {
    credentials: {
      async create() {
        await Promise.resolve();
        return stubPublicKeyCredential({
          prf: { enabled: true },
          transports: ["internal"],
        });
      },
      async get({ publicKey }: CredentialRequestOptions) {
        const salt = readEvaluatedPrfSalt(publicKey);
        fallbackSalt = salt;
        return stubPublicKeyCredential({
          prf: { results: { first: salt.buffer } },
        });
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    const pending = createPasskeyWithPrfOutput({
      rp: { id: "example.com", name: "Mera Test" },
      user: { name: "nad", displayName: "nad" },
      prfSalt,
    });

    prfSalt.fill(255);

    const result = await pending;

    expect(result.prfSalt).toEqual(originalSalt);
    expect(result.prfOutput).toEqual(originalSalt);
    expect(fallbackSalt).toEqual(originalSalt);
  });
});
