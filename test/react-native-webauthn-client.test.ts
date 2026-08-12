import { expect, test } from "@playwright/test";
import { createReactNativeWebAuthnClient } from "../dist/react-native-webauthn-client-internal.js";

type PlatformApi = Parameters<typeof createReactNativeWebAuthnClient>[0];

type NativeCreateRequest = Parameters<PlatformApi["createPlatformKey"]>[0];
type NativeGetRequest = Parameters<PlatformApi["getPlatformKey"]>[0];
type NativeCreateResult = Awaited<ReturnType<PlatformApi["createPlatformKey"]>>;
type NativeGetResult = Awaited<ReturnType<PlatformApi["getPlatformKey"]>>;

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

function stubPlatformApi(
  options: {
    createResult?: NativeCreateResult;
    getResult?: NativeGetResult;
  } = {},
): {
  platformApi: PlatformApi;
  createRequests: NativeCreateRequest[];
  getRequests: NativeGetRequest[];
} {
  const createRequests: NativeCreateRequest[] = [];
  const getRequests: NativeGetRequest[] = [];

  const platformApi: PlatformApi = {
    async createPlatformKey(request) {
      createRequests.push(request);
      return options.createResult ?? createResult();
    },
    async getPlatformKey(request) {
      getRequests.push(request);
      return options.getResult ?? getResult();
    },
  };

  return { platformApi, createRequests, getRequests };
}

test("createCredential converts data to and from createPlatformKey", async () => {
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
  const { platformApi, createRequests } = stubPlatformApi({
    createResult: nativeResult,
  });
  const client = createReactNativeWebAuthnClient(platformApi);
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

test("getCredential converts data to and from getPlatformKey", async () => {
  const { platformApi, getRequests } = stubPlatformApi({
    getResult: getResult({
      id: "-_8",
      clientExtensionResults: {
        prf: { results: { first: new Uint8Array([4, 5, 6]) } },
      },
    }),
  });
  const client = createReactNativeWebAuthnClient(platformApi);
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
        {
          type: "public-key",
          id: "-_8",
          transports: ["internal", "future", "usb"],
        },
      ],
      timeout: 15_000,
    },
  ]);
  expect(result).toEqual({
    credentialId: new Uint8Array([251, 255]),
    prfOutput: new Uint8Array([4, 5, 6]),
  });
});
