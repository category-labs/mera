import { base64urlnopad } from "@scure/base";
import type {
  Passkey,
  PasskeyGetRequest,
  PasskeyGetResult,
} from "react-native-passkey";
import { base64UrlDecode, normalizePrfOutput } from "./encoding.js";
import type { MeraErrorCode } from "./errors.js";
import type { WebAuthnClient } from "./webauthn.js";

type PlatformApi = Pick<
  typeof Passkey,
  "createPlatformKey" | "getImmediate" | "getPlatformKey"
>;

type NativeExtensions = NonNullable<PasskeyGetRequest["extensions"]>;

type NativeTransport = NonNullable<
  NonNullable<PasskeyGetRequest["allowCredentials"]>[number]["transports"]
>[number];
type NativePrfValue = NonNullable<
  NonNullable<
    NonNullable<PasskeyGetResult["clientExtensionResults"]>["prf"]
  >["results"]
>["first"];

function createReactNativeWebAuthnClient(
  platformApi: PlatformApi,
): WebAuthnClient {
  return {
    async createCredential(request) {
      // The general iOS entry point can offer a security key, whose result has
      // no PRF output. Android treats the platform-only flag as a no-op.
      const created = await platformApi.createPlatformKey({
        rp: request.rp,
        user: {
          id: base64urlnopad.encode(request.user.id),
          name: request.user.name,
          displayName: request.user.displayName,
        },
        challenge: base64urlnopad.encode(request.challenge),
        pubKeyCredParams: request.algorithms.map((alg) => ({
          type: "public-key",
          alg,
        })),
        authenticatorSelection: {
          residentKey: request.residentKey,
          requireResidentKey: true,
          userVerification: request.userVerification,
        },
        attestation: request.attestation,
        extensions: prfExtension(request.prfSalt),
        ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
      });

      const prf = created.clientExtensionResults?.prf;

      return {
        credentialId: decodeNativeBase64Url(
          created.rawId,
          "Credential ID",
          "PASSKEY_OPERATION_FAILED",
        ),
        transports: created.response.transports,
        prfEnabled: prf?.enabled === true,
        prfOutput: readPrfOutput(prf?.results?.first),
      };
    },

    async getCredential(request) {
      const { allowCredential } = request;
      const nativeRequest: PasskeyGetRequest = {
        rpId: request.rpId,
        challenge: base64urlnopad.encode(request.challenge),
        userVerification: request.userVerification,
        extensions: prfExtension(request.prfSalt),
        ...(allowCredential !== undefined
          ? {
              allowCredentials: [
                {
                  type: "public-key" as const,
                  id: base64urlnopad.encode(allowCredential.credentialId),
                  ...(allowCredential.transports !== undefined
                    ? {
                        transports:
                          allowCredential.transports as NativeTransport[],
                      }
                    : {}),
                },
              ],
            }
          : {}),
        ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
      };
      // getImmediate sends only the platform request, as getPlatformKey does.
      const asserted =
        request.immediate === true
          ? await platformApi.getImmediate(nativeRequest)
          : await platformApi.getPlatformKey(nativeRequest);

      return {
        credentialId: decodeNativeBase64Url(
          asserted.rawId ?? asserted.id,
          "Credential ID",
          "PASSKEY_OPERATION_FAILED",
        ),
        prfOutput: readPrfOutput(
          asserted.clientExtensionResults?.prf?.results?.first,
        ),
      };
    },
  };
}

/**
 * react-native-passkey rewrites binary request fields on Android. On iOS, the
 * PRF salt reaches Swift as the index-keyed object produced by stringifying a
 * Uint8Array. Keeping the salt as bytes is the one shape both platforms read.
 */
function prfExtension(prfSalt: Uint8Array): NativeExtensions {
  return { prf: { eval: { first: prfSalt } } };
}

function decodeNativeBase64Url(
  value: string,
  name: string,
  code: MeraErrorCode,
): Uint8Array {
  return base64UrlDecode(
    value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    { name, code },
  );
}

function readPrfOutput(
  value: NativePrfValue | undefined,
): Uint8Array | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") {
    return decodeNativeBase64Url(value, "PRF output", "PRF_UNAVAILABLE");
  }
  return normalizePrfOutput(value);
}

export { createReactNativeWebAuthnClient };
