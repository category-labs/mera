import type {
  PasskeyCreateRequest,
  PasskeyCreateResult,
  PasskeyGetRequest,
  PasskeyGetResult,
} from "react-native-passkey";
import { base64UrlDecode, base64UrlEncode } from "./encoding.js";
import { MeraError, type MeraErrorCode } from "./errors.js";
import type { PasskeyCredentialTransport } from "./types.js";
import type { WebAuthnClient } from "./webauthn.js";

type ReactNativePasskeyApi = {
  createPlatformKey(
    request: PasskeyCreateRequest,
  ): Promise<PasskeyCreateResult>;
  getPlatformKey(request: PasskeyGetRequest): Promise<PasskeyGetResult>;
};

type NativeTransport = NonNullable<
  NonNullable<PasskeyGetRequest["allowCredentials"]>[number]["transports"]
>[number];
type NativePrfValue = NonNullable<
  NonNullable<
    NonNullable<PasskeyGetResult["clientExtensionResults"]>["prf"]
  >["results"]
>["first"];

const NATIVE_TRANSPORTS: readonly string[] = [
  "ble",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
];

/**
 * Builds a WebAuthn client over the part of react-native-passkey that mera
 * needs. The injected API keeps native modules out of Node tests.
 *
 * @internal
 */
function createReactNativeWebAuthnClient(
  passkey: ReactNativePasskeyApi,
): WebAuthnClient {
  return {
    async createCredential(request) {
      // The general iOS entry point can offer a security key, whose result has
      // no PRF output. Android treats the platform-only flag as a no-op.
      const created = await passkey.createPlatformKey({
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
          created.rawId ?? created.id,
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
      const asserted = await passkey.getPlatformKey({
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
                        transports: knownTransports(allowCredential.transports),
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
function prfExtension(prfSalt: Uint8Array): {
  prf: { eval: { first: Uint8Array } };
} {
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
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);

  return Uint8Array.from(value, (byte) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new MeraError(
        "PRF_UNAVAILABLE",
        "PRF output must contain only byte values (integers 0-255)",
      );
    }
    return byte;
  });
}

function knownTransports(
  transports: readonly PasskeyCredentialTransport[],
): NativeTransport[] {
  return transports.filter((transport): transport is NativeTransport =>
    NATIVE_TRANSPORTS.includes(transport),
  );
}

export type { ReactNativePasskeyApi };
export { createReactNativeWebAuthnClient };
