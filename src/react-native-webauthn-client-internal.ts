import type { Passkey } from "react-native-passkey";
import {
  base64UrlDecode,
  base64UrlEncode,
  normalizeByteArray,
} from "./encoding.js";
import type { MeraErrorCode } from "./errors.js";
import type { WebAuthnClient } from "./webauthn.js";

type PlatformApi = Pick<typeof Passkey, "createPlatformKey" | "getPlatformKey">;

type NativeGetRequest = Parameters<PlatformApi["getPlatformKey"]>[0];
type NativeGetResult = Awaited<ReturnType<PlatformApi["getPlatformKey"]>>;
type NativeExtensions = NonNullable<NativeGetRequest["extensions"]>;

type NativeTransport = NonNullable<
  NonNullable<NativeGetRequest["allowCredentials"]>[number]["transports"]
>[number];
type NativePrfValue = NonNullable<
  NonNullable<
    NonNullable<NativeGetResult["clientExtensionResults"]>["prf"]
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
          id: base64UrlEncode(request.user.id),
          name: request.user.name,
          displayName: request.user.displayName,
        },
        challenge: base64UrlEncode(request.challenge),
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
      const prfOutput = readPrfOutput(prf?.results?.first);
      const transports = created.response.transports;

      return {
        credentialId: decodeNativeBase64Url(
          created.rawId,
          "Credential ID",
          "PASSKEY_OPERATION_FAILED",
        ),
        ...(transports !== undefined ? { transports } : {}),
        prfEnabled: prf?.enabled === true,
        ...(prfOutput !== undefined ? { prfOutput } : {}),
      };
    },

    async getCredential(request) {
      const { allowCredential } = request;
      const asserted = await platformApi.getPlatformKey({
        rpId: request.rpId,
        challenge: base64UrlEncode(request.challenge),
        userVerification: request.userVerification,
        extensions: prfExtension(request.prfSalt),
        ...(allowCredential !== undefined
          ? {
              allowCredentials: [
                {
                  type: "public-key" as const,
                  id: base64UrlEncode(allowCredential.credentialId),
                  ...(allowCredential.transports !== undefined
                    ? {
                        transports: [
                          ...allowCredential.transports,
                        ] as NativeTransport[],
                      }
                    : {}),
                },
              ],
            }
          : {}),
        ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
      });

      const prfOutput = readPrfOutput(
        asserted.clientExtensionResults?.prf?.results?.first,
      );

      return {
        credentialId: decodeNativeBase64Url(
          asserted.rawId ?? asserted.id,
          "Credential ID",
          "PASSKEY_OPERATION_FAILED",
        ),
        ...(prfOutput !== undefined ? { prfOutput } : {}),
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
  return normalizeByteArray(value, {
    name: "PRF output",
    code: "PRF_UNAVAILABLE",
  });
}

export { createReactNativeWebAuthnClient };
