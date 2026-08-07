import { expect, test } from "@playwright/test";
import {
  createReactNativeWebAuthnClient,
  type ReactNativeWebAuthnApi,
} from "../dist/react-native-webauthn-client-internal.js";

type NativeCreateRequest = Parameters<
  ReactNativeWebAuthnApi["createPlatformKey"]
>[0];
type NativeGetRequest = Parameters<ReactNativeWebAuthnApi["getPlatformKey"]>[0];
type NativeCreateResult = Awaited<
  ReturnType<ReactNativeWebAuthnApi["createPlatformKey"]>
>;
type NativeGetResult = Awaited<
  ReturnType<ReactNativeWebAuthnApi["getPlatformKey"]>
>;

function createResult(
  overrides: Partial<NativeCreateResult> = {},
): NativeCreateResult {
  return {
    id: "AQID",
    rawId: "AQID",
    response: { clientDataJSON: "", attestationObject: "" },
    ...overrides,
  };
}

function getResult(overrides: Partial<NativeGetResult> = {}): NativeGetResult {
  return {
    id: "AQID",
    response: {
      authenticatorData: "",
      clientDataJSON: "",
      signature: "",
    },
    ...overrides,
  };
}

function stubApi(
  options: {
    createResult?: NativeCreateResult;
    getResult?: NativeGetResult;
  } = {},
): {
  api: ReactNativeWebAuthnApi;
  createRequests: NativeCreateRequest[];
  getRequests: NativeGetRequest[];
} {
  const createRequests: NativeCreateRequest[] = [];
  const getRequests: NativeGetRequest[] = [];

  const api: ReactNativeWebAuthnApi = {
    async createPlatformKey(request) {
      createRequests.push(request);
      return options.createResult ?? createResult();
    },
    async getPlatformKey(request) {
      getRequests.push(request);
      return options.getResult ?? getResult();
    },
  };

  return { api, createRequests, getRequests };
}

test("maps a creation ceremony to createPlatformKey", async () => {
  const nativeResult = createResult({
    rawId: "++//==",
    response: {
      clientDataJSON: "",
      attestationObject: "",
      transports: ["internal", "hybrid"] as NonNullable<
        NativeCreateResult["response"]["transports"]
      >,
    },
    clientExtensionResults: {
      prf: { enabled: true, results: { first: "AQID" } },
    },
  });
  const { api, createRequests, getRequests } = stubApi({
    createResult: nativeResult,
  });
  const client = createReactNativeWebAuthnClient(api);
  const prfSalt = new Uint8Array([9, 8, 7]);

  const result = await client.createCredential({
    rp: { id: "account.example.com", name: "Example" },
    user: {
      id: new Uint8Array([251, 255]),
      name: "account",
      displayName: "Account",
    },
    challenge: new Uint8Array([1, 2, 3]),
    algorithms: [-7, -257],
    prfSalt,
    residentKey: "required",
    userVerification: "required",
    attestation: "none",
    timeout: 30_000,
  });

  expect(createRequests).toHaveLength(1);
  expect(getRequests).toHaveLength(0);
  expect(createRequests[0]).toEqual({
    rp: { id: "account.example.com", name: "Example" },
    user: { id: "-_8", name: "account", displayName: "Account" },
    challenge: "AQID",
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    authenticatorSelection: {
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
    attestation: "none",
    extensions: { prf: { eval: { first: prfSalt } } },
    timeout: 30_000,
  });
  expect(result).toEqual({
    credentialId: new Uint8Array([251, 239, 255]),
    transports: ["internal", "hybrid"],
    prfEnabled: true,
    prfOutput: new Uint8Array([1, 2, 3]),
  });
});

test("maps an allowed assertion to getPlatformKey", async () => {
  const { api, getRequests } = stubApi({
    getResult: getResult({
      id: "-_8",
      clientExtensionResults: {
        prf: { results: { first: new Uint8Array([4, 5, 6]) } },
      },
    }),
  });
  const client = createReactNativeWebAuthnClient(api);
  const prfSalt = new Uint8Array([9, 8, 7]);

  const result = await client.getCredential({
    rpId: "account.example.com",
    challenge: new Uint8Array([1, 2, 3]),
    allowCredential: {
      credentialId: new Uint8Array([251, 255]),
      transports: ["internal", "future", "usb"],
    },
    prfSalt,
    userVerification: "required",
    timeout: 15_000,
  });

  expect(getRequests).toEqual([
    {
      rpId: "account.example.com",
      challenge: "AQID",
      userVerification: "required",
      extensions: { prf: { eval: { first: prfSalt } } },
      allowCredentials: [
        { type: "public-key", id: "-_8", transports: ["internal", "usb"] },
      ],
      timeout: 15_000,
    },
  ]);
  expect(result).toEqual({
    credentialId: new Uint8Array([251, 255]),
    prfOutput: new Uint8Array([4, 5, 6]),
  });
});

test("omits optional assertion fields", async () => {
  const { api, getRequests } = stubApi();
  const client = createReactNativeWebAuthnClient(api);
  const prfSalt = new Uint8Array([1]);

  await client.getCredential({
    rpId: "account.example.com",
    challenge: new Uint8Array([2]),
    prfSalt,
    userVerification: "required",
  });

  expect(getRequests).toEqual([
    {
      rpId: "account.example.com",
      challenge: "Ag",
      userVerification: "required",
      extensions: { prf: { eval: { first: prfSalt } } },
    },
  ]);
});

const prfValues: Array<[string, Uint8Array | ArrayBuffer | number[]]> = [
  ["Uint8Array", new Uint8Array([1, 2, 3])],
  ["ArrayBuffer", new Uint8Array([1, 2, 3]).buffer],
  ["number array", [1, 2, 3]],
];

for (const [name, value] of prfValues) {
  test(`reads PRF output from a ${name}`, async () => {
    const { api } = stubApi({
      getResult: getResult({
        clientExtensionResults: { prf: { results: { first: value } } },
      }),
    });

    const result = await createReactNativeWebAuthnClient(api).getCredential({
      rpId: "account.example.com",
      challenge: new Uint8Array([1]),
      prfSalt: new Uint8Array([2]),
      userVerification: "required",
    });

    expect(result.prfOutput).toEqual(new Uint8Array([1, 2, 3]));
  });
}

for (const encoded of ["--__", "++//", "++//=="]) {
  test(`reads native base64 variant ${encoded}`, async () => {
    const { api } = stubApi({
      getResult: getResult({
        clientExtensionResults: {
          prf: { results: { first: encoded } },
        },
      }),
    });

    const result = await createReactNativeWebAuthnClient(api).getCredential({
      rpId: "account.example.com",
      challenge: new Uint8Array([1]),
      prfSalt: new Uint8Array([2]),
      userVerification: "required",
    });

    expect(result.prfOutput).toEqual(new Uint8Array([251, 239, 255]));
  });
}

for (const value of [-1, 256, 1.5, Number.NaN]) {
  test(`rejects malformed PRF byte ${String(value)}`, async () => {
    const { api } = stubApi({
      getResult: getResult({
        clientExtensionResults: {
          prf: { results: { first: [value] } },
        },
      }),
    });

    await expect(
      createReactNativeWebAuthnClient(api).getCredential({
        rpId: "account.example.com",
        challenge: new Uint8Array([1]),
        prfSalt: new Uint8Array([2]),
        userVerification: "required",
      }),
    ).rejects.toMatchObject({ code: "PRF_UNAVAILABLE" });
  });
}

test("preserves a native rejection", async () => {
  const cause = { error: "NoCredentials", message: "No credentials" };
  const api: ReactNativeWebAuthnApi = {
    async createPlatformKey() {
      return createResult();
    },
    async getPlatformKey() {
      throw cause;
    },
  };
  let received: unknown;

  try {
    await createReactNativeWebAuthnClient(api).getCredential({
      rpId: "account.example.com",
      challenge: new Uint8Array([1]),
      prfSalt: new Uint8Array([2]),
      userVerification: "required",
    });
  } catch (error) {
    received = error;
  }

  expect(received).toBe(cause);
});
