import { expect, test } from "@playwright/test";
import type {
  PasskeyCreateRequest,
  PasskeyCreateResult,
  PasskeyGetRequest,
  PasskeyGetResult,
} from "react-native-passkey";
import { createReactNativeWebAuthnClient } from "../dist/react-native-webauthn-client-internal.js";

type PlatformApi = Parameters<typeof createReactNativeWebAuthnClient>[0];

function createResult(
  overrides: Partial<PasskeyCreateResult> = {},
): PasskeyCreateResult {
  return {
    id: "AQID",
    rawId: "AQID",
    response: { clientDataJSON: "", attestationObject: "" },
    ...overrides,
  };
}

function getResult(
  overrides: Partial<PasskeyGetResult> = {},
): PasskeyGetResult {
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
    createResult?: PasskeyCreateResult;
    getResult?: PasskeyGetResult;
  } = {},
): {
  platformApi: PlatformApi;
  createRequests: PasskeyCreateRequest[];
  getRequests: PasskeyGetRequest[];
  immediateRequests: PasskeyGetRequest[];
} {
  const createRequests: PasskeyCreateRequest[] = [];
  const getRequests: PasskeyGetRequest[] = [];
  const immediateRequests: PasskeyGetRequest[] = [];

  const platformApi: PlatformApi = {
    async createPlatformKey(request) {
      createRequests.push(request);
      return options.createResult ?? createResult();
    },
    async getPlatformKey(request) {
      getRequests.push(request);
      return options.getResult ?? getResult();
    },
    async getImmediate(request) {
      immediateRequests.push(request);
      return options.getResult ?? getResult();
    },
  };

  return { platformApi, createRequests, getRequests, immediateRequests };
}

test("createCredential converts data to and from createPlatformKey", async () => {
  const nativeResult = createResult({
    rawId: "++//==",
    response: {
      clientDataJSON: "",
      attestationObject: "",
      transports: ["internal", "hybrid"] as NonNullable<
        PasskeyCreateResult["response"]["transports"]
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

test("getCredential asks getImmediate for an immediate request", async () => {
  const { platformApi, getRequests, immediateRequests } = stubPlatformApi();
  const client = createReactNativeWebAuthnClient(platformApi);

  await client.getCredential({
    rpId: "account.example.com",
    challenge: new Uint8Array([1, 2, 3]),
    prfSalt: new Uint8Array([9, 8, 7]),
    userVerification: "required",
    immediate: true,
  });

  expect(getRequests).toHaveLength(0);
  expect(immediateRequests).toHaveLength(1);
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
