import { expect, test } from "@playwright/test";
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
} from "../dist/passkey.js";
import { browserWebAuthnClient } from "../dist/webauthn.js";
import {
  CREDENTIAL_ID_BASE64URL,
  CREDENTIAL_ID_BYTES,
  DEFAULT_PRF_SALT,
  readEvaluatedPrfSalt,
  rp,
  SEQUENCE_PRF_OUTPUT,
  stubClient,
  stubPublicKeyCredential,
  user,
  withRecordedPrfOutputs,
  withStubbedGlobal,
} from "./helpers.js";

async function getPrfOutputWithStub(first: unknown): Promise<Uint8Array> {
  return withStubbedGlobal(
    "navigator",
    {
      credentials: {
        async get() {
          return stubPublicKeyCredential({ prf: { results: { first } } });
        },
      },
    },
    async () => {
      const { prfOutput } = await getPasskeyPrfOutput({
        rpId: rp.id,
        prfSalt: new Uint8Array(32),
      });
      return prfOutput;
    },
  );
}

test("getPasskeyPrfOutput works with a custom client outside a browser", async () => {
  const { client, calls } = stubClient();

  const result = await withStubbedGlobal("navigator", undefined, () =>
    getPasskeyPrfOutput({ rpId: rp.id, webAuthnClient: client }),
  );

  expect(result.credentialId).toBe(CREDENTIAL_ID_BASE64URL);
  expect(result.prfOutput).toEqual(DEFAULT_PRF_SALT);
  expect(calls.get).toHaveLength(1);
  expect(calls.get[0]).toMatchObject({
    rpId: rp.id,
    userVerification: "required",
  });
  expect(calls.get[0]?.challenge).toHaveLength(32);
  expect(calls.get[0]?.allowCredential).toBeUndefined();
});

test("getPasskeyPrfOutput copies an ArrayBuffer result without sharing memory", async () => {
  const source = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const out = await getPrfOutputWithStub(source.buffer);

  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual([...source]);

  // Mutating the source buffer must not affect the returned output.
  source[0] = 99;
  expect(out[0]).toBe(1);
});

test("getPasskeyPrfOutput copies only an ArrayBufferView's bytes", async () => {
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
  // array. Includes the boundary values 0 and 255, which must stay unchanged.
  const values = Array.from({ length: 32 }, (_, index) => index);
  values[31] = 255;
  const out = await getPrfOutputWithStub(values);

  expect(out).toBeInstanceOf(Uint8Array);
  expect([...out]).toEqual(values);
});

test("getPasskeyPrfOutput rejects array values outside the byte range", async () => {
  // Uint8Array.from would silently change each of these (256 -> 0, -1 -> 255,
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

test("getPasskeyPrfOutput zeroes the browser client's copy of the PRF output", async () => {
  const browserBytes = new Uint8Array(SEQUENCE_PRF_OUTPUT);
  const plainArray = [...SEQUENCE_PRF_OUTPUT];
  const shortArray = [1, 2, 3];

  const { prfOutputs } = await withRecordedPrfOutputs(
    browserWebAuthnClient,
    async () => {
      for (const first of [browserBytes, browserBytes.buffer, plainArray]) {
        await expect(getPrfOutputWithStub(first)).resolves.toEqual(
          SEQUENCE_PRF_OUTPUT,
        );
      }
      await expect(getPrfOutputWithStub(shortArray)).rejects.toMatchObject({
        code: "PRF_UNAVAILABLE",
      });
    },
  );

  const zeroed = new Uint8Array(32);
  expect(prfOutputs).toEqual([
    zeroed,
    zeroed,
    zeroed,
    new Uint8Array(shortArray.length),
  ]);
  expect(browserBytes).toEqual(SEQUENCE_PRF_OUTPUT);
});

test("getPasskeyPrfOutput leaves a custom client's PRF output as returned", async () => {
  const clientPrfOutput = new Uint8Array(SEQUENCE_PRF_OUTPUT);
  const { client } = stubClient({ getPrfOutput: () => clientPrfOutput });

  const { prfOutput } = await getPasskeyPrfOutput({
    rpId: rp.id,
    webAuthnClient: client,
  });

  expect(prfOutput).toEqual(SEQUENCE_PRF_OUTPUT);
  expect(clientPrfOutput).toEqual(SEQUENCE_PRF_OUTPUT);
});

test("getPasskeyPrfOutput rejects a custom client response with no PRF output", async () => {
  const { client } = stubClient({ getPrfOutput: () => undefined });

  await expect(
    getPasskeyPrfOutput({ rpId: rp.id, webAuthnClient: client }),
  ).rejects.toMatchObject({ code: "PRF_UNAVAILABLE" });
});

test("getPasskeyPrfOutput rejects an empty credentialId without prompting", async () => {
  // A malformed stored ID must fail closed instead of silently widening the
  // request to any discoverable credential for the relying party.
  const { client, calls } = stubClient();

  await expect(
    getPasskeyPrfOutput({
      rpId: rp.id,
      credential: { credentialId: "" },
      prfSalt: new Uint8Array(32),
      webAuthnClient: client,
    }),
  ).rejects.toMatchObject({ code: "INPUT_INVALID" });
  expect(calls.get).toHaveLength(0);
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
    const created = await createPasskeyWithPrfOutput({ rp, user });
    expect(created.prfSalt).toEqual(expected);
    expect(created.prfOutput).toEqual(expected);

    created.prfSalt.fill(255);

    const recreated = await createPasskeyWithPrfOutput({ rp, user });
    expect(recreated.prfSalt).toEqual(expected);

    const asserted = await getPasskeyPrfOutput({ rpId: rp.id });
    expect(asserted.prfOutput).toEqual(expected);
  });

  expect(evaluatedSalts).toHaveLength(5);
  for (const salt of evaluatedSalts) {
    expect(salt).toEqual(DEFAULT_PRF_SALT);
  }
});

test("PRF output helpers reject an explicit salt of the wrong length", async () => {
  const { client, calls } = stubClient();

  await expect(
    createPasskeyWithPrfOutput({
      rp,
      user,
      prfSalt: new Uint8Array(31),
      webAuthnClient: client,
    }),
  ).rejects.toMatchObject({ code: "INPUT_INVALID" });

  await expect(
    getPasskeyPrfOutput({
      rpId: rp.id,
      prfSalt: new Uint8Array(31),
      webAuthnClient: client,
    }),
  ).rejects.toMatchObject({ code: "INPUT_INVALID" });

  expect(calls.create).toHaveLength(0);
  expect(calls.get).toHaveLength(0);
});

test("passkey helpers report CRYPTO_UNAVAILABLE when Web Crypto is unavailable", async () => {
  // The internal challenge is generated before the passkey request, so the
  // crypto failure is reachable without a credentials stub.
  await withStubbedGlobal("crypto", undefined, async () => {
    const prfSalt = new Uint8Array(32);

    await expect(
      getPasskeyPrfOutput({ rpId: rp.id, prfSalt }),
    ).rejects.toMatchObject({ code: "CRYPTO_UNAVAILABLE" });

    await expect(
      createPasskeyWithPrfOutput({ rp, user, prfSalt }),
    ).rejects.toMatchObject({ code: "CRYPTO_UNAVAILABLE" });
  });
});

test("getPasskeyPrfOutput refuses immediate with a credential before any prompt", async () => {
  const { client, calls } = stubClient();

  await expect(
    getPasskeyPrfOutput({
      rpId: rp.id,
      credential: { credentialId: CREDENTIAL_ID_BASE64URL },
      immediate: true,
      webAuthnClient: client,
    }),
  ).rejects.toMatchObject({ code: "INPUT_INVALID" });

  expect(calls.get).toHaveLength(0);
});

test("the browser client sets uiMode only for immediate assertions", async () => {
  const requests: CredentialRequestOptions[] = [];
  const navigator = {
    credentials: {
      async get(request: CredentialRequestOptions) {
        requests.push(request);
        return stubPublicKeyCredential({
          prf: { results: { first: new Uint8Array(32).buffer } },
        });
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    await getPasskeyPrfOutput({ rpId: rp.id, immediate: true });
    await getPasskeyPrfOutput({ rpId: rp.id });
  });

  expect(requests[0]).toHaveProperty("uiMode", "immediate");
  expect(requests[1]).not.toHaveProperty("uiMode");
});

test("passkey functions keep the cause of custom client errors", async () => {
  const platformFailure = new Error("the person dismissed the prompt");
  const { client } = stubClient({
    createError: platformFailure,
    getError: platformFailure,
  });

  for (const runPasskeyRequest of [
    () => getPasskeyPrfOutput({ rpId: rp.id, webAuthnClient: client }),
    () => createPasskeyWithPrfOutput({ rp, user, webAuthnClient: client }),
  ]) {
    await expect(runPasskeyRequest()).rejects.toMatchObject({
      code: "PASSKEY_OPERATION_FAILED",
      cause: platformFailure,
    });
  }
});

test("createPasskeyWithPrfOutput generates a fresh user ID for each passkey", async () => {
  // The handle never reaches the caller, so the WebAuthn options are the only
  // place it is observable. A repeated handle would make the second call
  // overwrite the passkey the first one created.
  const handles: Uint8Array[] = [];

  const navigator = {
    credentials: {
      async create({ publicKey }: CredentialCreationOptions) {
        handles.push(new Uint8Array(publicKey?.user.id as Uint8Array));
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
    await createPasskeyWithPrfOutput({ rp, user });
    await createPasskeyWithPrfOutput({ rp, user });
  });

  expect(handles[0]).toHaveLength(32);
  expect(handles[1]).toHaveLength(32);
  expect(handles[0]).not.toEqual(handles[1]);
});

test("createPasskeyWithPrfOutput sends its options to a custom client", async () => {
  const createPrfOutput = new Uint8Array(32).fill(7);
  const { client, calls } = stubClient({ createPrfOutput });

  const created = await withStubbedGlobal("navigator", undefined, () =>
    createPasskeyWithPrfOutput({ rp, user, webAuthnClient: client }),
  );

  expect(created.prfOutput).toEqual(createPrfOutput);
  expect(calls.get).toHaveLength(0);
  expect(calls.create[0]).toMatchObject({
    rp,
    algorithms: [-7, -257],
    residentKey: "required",
    userVerification: "required",
    attestation: "none",
  });
  expect(calls.create[0]?.user.id).toHaveLength(32);
  expect(calls.create[0]?.challenge).toHaveLength(32);
  expect(calls.create[0]?.prfSalt).toEqual(DEFAULT_PRF_SALT);
});

test("createPasskeyWithPrfOutput uses the same client for its second request", async () => {
  const { client, calls } = stubClient();

  const created = await createPasskeyWithPrfOutput({
    rp,
    user,
    webAuthnClient: client,
  });

  expect(created.prfOutput).toEqual(DEFAULT_PRF_SALT);
  expect(calls.get).toHaveLength(1);
  expect(calls.get[0]?.allowCredential).toEqual({
    credentialId: CREDENTIAL_ID_BYTES,
    transports: ["internal"],
  });
  expect(calls.get[0]?.prfSalt).toEqual(calls.create[0]?.prfSalt);
});

test("createPasskeyWithPrfOutput stops when a custom client reports no PRF support", async () => {
  const { client, calls } = stubClient({ prfEnabled: false });

  await expect(
    createPasskeyWithPrfOutput({ rp, user, webAuthnClient: client }),
  ).rejects.toMatchObject({ code: "PRF_UNAVAILABLE" });

  expect(calls.get).toHaveLength(0);
});

test("createPasskeyWithPrfOutput copies prfSalt for its second request and result", async () => {
  const originalSalt = Uint8Array.from({ length: 32 }, (_, index) => index);
  const prfSalt = new Uint8Array(originalSalt);
  let secondRequestSalt: Uint8Array | undefined;

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
        secondRequestSalt = salt;
        return stubPublicKeyCredential({
          prf: { results: { first: salt.buffer } },
        });
      },
    },
  };

  await withStubbedGlobal("navigator", navigator, async () => {
    const pending = createPasskeyWithPrfOutput({ rp, user, prfSalt });

    prfSalt.fill(255);

    const result = await pending;

    expect(result.prfSalt).toEqual(originalSalt);
    expect(result.prfOutput).toEqual(originalSalt);
    expect(secondRequestSalt).toEqual(originalSalt);
  });
});
