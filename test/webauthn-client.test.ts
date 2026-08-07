import { expect, test } from "@playwright/test";
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
} from "../dist/passkey.js";
import { createSecretVaultWithNewPasskey } from "../dist/secret.js";
import type { WebAuthnClient } from "../dist/webauthn.js";
import {
  DEFAULT_PRF_SALT,
  STUB_CREDENTIAL_ID,
  STUB_CREDENTIAL_ID_BYTES,
  withStubbedGlobal,
} from "./helpers.js";

const rp = { id: "example.com", name: "Mera Test" };
const user = { name: "nad", displayName: "nad" };

type ClientCalls = {
  create: Parameters<WebAuthnClient["createCredential"]>[0][];
  get: Parameters<WebAuthnClient["getCredential"]>[0][];
};

// A WebAuthnClient with no DOM behind it, standing in for a native passkey
// module. Assertions answer with a copy of the salt they were asked to
// evaluate, so a test can read back which salt reached the platform.
function stubClient(
  answers: {
    prfEnabled?: boolean;
    createPrfOutput?: () => Uint8Array;
    getPrfOutput?: (prfSalt: Uint8Array) => Uint8Array | undefined;
  } = {},
): { client: WebAuthnClient; calls: ClientCalls } {
  const calls: ClientCalls = { create: [], get: [] };
  const getPrfOutput =
    answers.getPrfOutput ?? ((prfSalt) => new Uint8Array(prfSalt));

  const client: WebAuthnClient = {
    async createCredential(request) {
      calls.create.push(request);
      const prfOutput = answers.createPrfOutput?.();

      return {
        credentialId: new Uint8Array(STUB_CREDENTIAL_ID_BYTES),
        transports: ["internal"],
        prfEnabled: answers.prfEnabled ?? true,
        ...(prfOutput !== undefined ? { prfOutput } : {}),
      };
    },
    async getCredential(request) {
      calls.get.push(request);
      const prfOutput = getPrfOutput(request.prfSalt);

      return {
        credentialId: new Uint8Array(STUB_CREDENTIAL_ID_BYTES),
        ...(prfOutput !== undefined ? { prfOutput } : {}),
      };
    },
  };

  return { client, calls };
}

test("an assertion runs on the supplied client with no DOM present", async () => {
  const { client, calls } = stubClient();

  const asserted = await withStubbedGlobal("navigator", undefined, () =>
    getPasskeyPrfOutput({ rpId: "example.com", webAuthnClient: client }),
  );

  expect(asserted.credentialId).toBe(STUB_CREDENTIAL_ID);
  expect(asserted.prfOutput).toEqual(DEFAULT_PRF_SALT);
  expect(calls.get).toHaveLength(1);
  expect(calls.get[0]).toMatchObject({
    rpId: "example.com",
    userVerification: "required",
  });
  expect(calls.get[0]?.challenge).toHaveLength(32);
  expect(calls.get[0]?.allowCredential).toBeUndefined();
});

test("creation hands the client mera's fixed ceremony policy", async () => {
  const createPrfOutput = new Uint8Array(32).fill(7);
  const { client, calls } = stubClient({
    createPrfOutput: () => new Uint8Array(createPrfOutput),
  });

  const created = await withStubbedGlobal("navigator", undefined, () =>
    createPasskeyWithPrfOutput({ rp, user, webAuthnClient: client }),
  );

  expect(created.prfOutput).toEqual(createPrfOutput);
  // Create-time PRF output means no second ceremony, so no second prompt.
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

test("the client cannot reach the caller's PRF salt", async () => {
  const prfSalt = new Uint8Array(32).fill(2);
  const client: WebAuthnClient = {
    async createCredential(request) {
      request.prfSalt.fill(0);

      return {
        credentialId: new Uint8Array(STUB_CREDENTIAL_ID_BYTES),
        prfEnabled: true,
        prfOutput: new Uint8Array(32).fill(3),
      };
    },
    async getCredential() {
      throw new Error("no fallback assertion expected");
    },
  };

  const created = await createPasskeyWithPrfOutput({
    rp,
    user,
    prfSalt,
    webAuthnClient: client,
  });

  expect(prfSalt).toEqual(new Uint8Array(32).fill(2));
  expect(created.prfSalt).toEqual(prfSalt);
});

test("the creation fallback assertion runs on the same client", async () => {
  const { client, calls } = stubClient();

  const created = await createPasskeyWithPrfOutput({
    rp,
    user,
    webAuthnClient: client,
  });

  expect(created.prfOutput).toEqual(DEFAULT_PRF_SALT);
  expect(calls.get).toHaveLength(1);
  expect(calls.get[0]?.allowCredential).toEqual({
    credentialId: STUB_CREDENTIAL_ID_BYTES,
    transports: ["internal"],
  });
  expect(calls.get[0]?.prfSalt).toEqual(calls.create[0]?.prfSalt);
});

test("a client that does not enable PRF fails before any fallback ceremony", async () => {
  const { client, calls } = stubClient({ prfEnabled: false });

  await expect(
    createPasskeyWithPrfOutput({ rp, user, webAuthnClient: client }),
  ).rejects.toMatchObject({ code: "PRF_UNAVAILABLE" });

  expect(calls.get).toHaveLength(0);
});

test("a create-time PRF output stands even when the client reports no PRF", async () => {
  const createPrfOutput = new Uint8Array(32).fill(7);
  const { client, calls } = stubClient({
    prfEnabled: false,
    createPrfOutput: () => new Uint8Array(createPrfOutput),
  });

  const created = await createPasskeyWithPrfOutput({
    rp,
    user,
    webAuthnClient: client,
  });

  expect(created.prfOutput).toEqual(createPrfOutput);
  expect(calls.get).toHaveLength(0);
});

test("the client's PRF output is copied, not adopted", async () => {
  const clientOutput = new Uint8Array(32).fill(9);
  const { client } = stubClient({ getPrfOutput: () => clientOutput });

  const { prfOutput } = await getPasskeyPrfOutput({
    rpId: "example.com",
    webAuthnClient: client,
  });

  clientOutput.fill(1);

  expect(prfOutput).toEqual(new Uint8Array(32).fill(9));
});

test("an assertion output that is missing or not 32 bytes is rejected", async () => {
  for (const getPrfOutput of [
    () => undefined,
    () => new Uint8Array(16).fill(9),
  ]) {
    const { client } = stubClient({ getPrfOutput });

    await expect(
      getPasskeyPrfOutput({ rpId: "example.com", webAuthnClient: client }),
    ).rejects.toMatchObject({ code: "PRF_UNAVAILABLE" });
  }
});

test("an error from the client arrives as PASSKEY_OPERATION_FAILED with its cause", async () => {
  const platformFailure = new Error("the person dismissed the prompt");
  const client: WebAuthnClient = {
    async createCredential() {
      throw platformFailure;
    },
    async getCredential() {
      throw platformFailure;
    },
  };

  for (const runCeremony of [
    () => getPasskeyPrfOutput({ rpId: "example.com", webAuthnClient: client }),
    () => createPasskeyWithPrfOutput({ rp, user, webAuthnClient: client }),
  ]) {
    await expect(runCeremony()).rejects.toMatchObject({
      code: "PASSKEY_OPERATION_FAILED",
      cause: platformFailure,
    });
  }
});

test("an assertion request carries the caller's credential and transports", async () => {
  const { client, calls } = stubClient();

  await getPasskeyPrfOutput({
    rpId: "example.com",
    credential: { credentialId: STUB_CREDENTIAL_ID, transports: ["hybrid"] },
    webAuthnClient: client,
  });

  expect(calls.get[0]?.allowCredential).toEqual({
    credentialId: STUB_CREDENTIAL_ID_BYTES,
    transports: ["hybrid"],
  });
});

test("passkey flows need crypto.getRandomValues but not crypto.subtle", async () => {
  const { getRandomValues } = globalThis.crypto;
  const randomOnly = {
    getRandomValues: getRandomValues.bind(globalThis.crypto),
  };
  const { client } = stubClient();

  await withStubbedGlobal("crypto", randomOnly, async () => {
    const asserted = await getPasskeyPrfOutput({
      rpId: "example.com",
      webAuthnClient: client,
    });
    expect(asserted.prfOutput).toEqual(DEFAULT_PRF_SALT);

    // Vault encryption is the part that needs subtle.
    await expect(
      createSecretVaultWithNewPasskey({
        rp,
        user,
        secret: new Uint8Array([1, 2, 3]),
        webAuthnClient: client,
      }),
    ).rejects.toMatchObject({ code: "CRYPTO_UNAVAILABLE" });
  });
});
