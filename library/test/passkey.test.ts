import { expect, test } from "@playwright/test";
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
} from "../dist/passkey.js";
import type { WebAuthnClient } from "../dist/webauthn.js";
import {
  CREDENTIAL_ID_BASE64URL,
  CREDENTIAL_ID_BYTES,
  DEFAULT_PRF_SALT,
  readEvaluatedPrfSalt,
  stubPublicKeyCredential,
  withStubbedGlobal,
} from "./helpers.js";

const rp = { id: "example.com", name: "Mera Test" };
const user = { name: "nad", displayName: "nad" };

type ClientCalls = {
  create: Parameters<WebAuthnClient["createCredential"]>[0][];
  get: Parameters<WebAuthnClient["getCredential"]>[0][];
};

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
      const prfOutput = answers.createPrfOutput;

      return {
        credentialId: new Uint8Array(CREDENTIAL_ID_BYTES),
        transports: ["internal"],
        prfEnabled: answers.prfEnabled ?? true,
        ...(prfOutput !== undefined ? { prfOutput } : {}),
      };
    },
    async getCredential(request) {
      calls.get.push(request);
      if (answers.getError !== undefined) {
        throw answers.getError;
      }
      const prfOutput = getPrfOutput(request.prfSalt);

      return {
        credentialId: new Uint8Array(CREDENTIAL_ID_BYTES),
        ...(prfOutput !== undefined ? { prfOutput } : {}),
      };
    },
  };

  return { client, calls };
}

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
        rpId: "example.com",
        prfSalt: new Uint8Array(32),
      });
      return prfOutput;
    },
  );
}

test("getPasskeyPrfOutput works with a custom client outside a browser", async () => {
  const { client, calls } = stubClient();

  const result = await withStubbedGlobal("navigator", undefined, () =>
    getPasskeyPrfOutput({ rpId: "example.com", webAuthnClient: client }),
  );

  expect(result.credentialId).toBe(CREDENTIAL_ID_BASE64URL);
  expect(result.prfOutput).toEqual(DEFAULT_PRF_SALT);
  expect(calls.get).toHaveLength(1);
  expect(calls.get[0]).toMatchObject({
    rpId: "example.com",
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

test("getPasskeyPrfOutput rejects a custom client response with no PRF output", async () => {
  const { client } = stubClient({ getPrfOutput: () => undefined });

  await expect(
    getPasskeyPrfOutput({ rpId: "example.com", webAuthnClient: client }),
  ).rejects.toMatchObject({ code: "PRF_UNAVAILABLE" });
});

test("getPasskeyPrfOutput rejects an empty credentialId without prompting", async () => {
  // A malformed stored ID must fail closed instead of silently widening the
  // request to any discoverable credential for the relying party.
  let asserted = false;

  const navigator = {
    credentials: {
      async get() {
        asserted = true;
        throw new Error("passkey request must not start");
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
        throw new Error("passkey request must not start");
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
  // The internal challenge is generated before the passkey request, so the
  // crypto failure is reachable without a credentials stub.
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

test("passkey functions keep the cause of custom client errors", async () => {
  const platformFailure = new Error("the person dismissed the prompt");
  const { client } = stubClient({
    createError: platformFailure,
    getError: platformFailure,
  });

  for (const runPasskeyRequest of [
    () => getPasskeyPrfOutput({ rpId: "example.com", webAuthnClient: client }),
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
    const pending = createPasskeyWithPrfOutput({
      rp: { id: "example.com", name: "Mera Test" },
      user: { name: "nad", displayName: "nad" },
      prfSalt,
    });

    prfSalt.fill(255);

    const result = await pending;

    expect(result.prfSalt).toEqual(originalSalt);
    expect(result.prfOutput).toEqual(originalSalt);
    expect(secondRequestSalt).toEqual(originalSalt);
  });
});
