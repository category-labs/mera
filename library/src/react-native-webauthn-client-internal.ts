import { base64urlnopad } from "@scure/base";
import type {
  Passkey,
  PasskeyCreateRequest,
  PasskeyGetRequest,
  PasskeyGetResult,
} from "react-native-passkey";
import { base64UrlDecode, normalizePrfOutput } from "./encoding.js";
import {
  MeraError,
  type MeraErrorCode,
  toPasskeyError,
  withCreatedCredential,
} from "./errors.js";
import type { WebAuthnClient } from "./webauthn.js";

type PlatformApi = Pick<
  typeof Passkey,
  "createPlatformKey" | "getImmediate" | "getPlatformKey"
>;

type NativeExtensions = NonNullable<PasskeyGetRequest["extensions"]>;
type NativeCredentialDescriptor = NonNullable<
  PasskeyGetRequest["allowCredentials"]
>[number];

type NativeTransport = NonNullable<
  NativeCredentialDescriptor["transports"]
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
      const { excludeCredentials } = request;
      const hasExcludedCredentials =
        excludeCredentials !== undefined && excludeCredentials.length > 0;
      const nativeRequest: PasskeyCreateRequest = {
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
        ...(hasExcludedCredentials
          ? {
              excludeCredentials: excludeCredentials.map(
                toNativeCredentialDescriptor,
              ),
            }
          : {}),
        authenticatorSelection: {
          residentKey: request.residentKey,
          requireResidentKey: true,
          userVerification: request.userVerification,
        },
        attestation: request.attestation,
        extensions: prfExtension(request.prfSalt),
        ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
      };
      // The general iOS entry point can offer a security key, whose result has
      // no PRF output. Android treats the platform-only flag as a no-op.
      const created = await platformApi
        .createPlatformKey(nativeRequest)
        .catch(
          hasExcludedCredentials
            ? rejectCreateCeremony
            : rejectCancelledCeremony,
        );

      const credentialId = decodeNativeBase64Url(
        created.rawId,
        "Credential ID",
        "PASSKEY_OPERATION_FAILED",
      );
      const transports = created.response.transports;
      const prf = created.clientExtensionResults?.prf;
      let prfOutput: Uint8Array | undefined;
      try {
        prfOutput = readPrfOutput(prf?.results?.first);
      } catch (error) {
        throw withCreatedCredential(
          toPasskeyError(error, "Passkey creation failed"),
          { credentialId: base64urlnopad.encode(credentialId), transports },
        );
      }

      return {
        credentialId,
        transports,
        prfEnabled: prf?.enabled === true,
        prfOutput,
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
              allowCredentials: [toNativeCredentialDescriptor(allowCredential)],
            }
          : {}),
        ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
      };
      // getImmediate sends only the platform request, as getPlatformKey does.
      const assertion =
        request.immediate === true
          ? platformApi.getImmediate(nativeRequest)
          : platformApi.getPlatformKey(nativeRequest);
      const asserted = await assertion.catch(rejectCancelledCeremony);

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

function toNativeCredentialDescriptor(
  descriptor: WebAuthnClient.CredentialDescriptor,
): NativeCredentialDescriptor {
  return {
    type: "public-key",
    id: base64urlnopad.encode(descriptor.credentialId),
    ...(descriptor.transports !== undefined
      ? {
          transports: descriptor.transports as NativeTransport[],
        }
      : {}),
  };
}

/**
 * Rethrows react-native-passkey's `CredentialAlreadyExists` rejection as
 * `PASSKEY_EXISTS`, and delegates cancellation errors to
 * {@link rejectCancelledCeremony}.
 */
function rejectCreateCeremony(error: unknown): never {
  const reason = (error as { error?: unknown } | null)?.error;
  if (reason === "CredentialAlreadyExists") {
    throw new MeraError(
      "PASSKEY_EXISTS",
      "An excluded passkey already exists on this authenticator",
      { cause: error },
    );
  }
  rejectCancelledCeremony(error);
}

/**
 * Rethrows react-native-passkey's `UserCancelled`, `TimedOut`, and
 * `NoCredentials` rejections as `PASSKEY_CANCELLED`.
 */
function rejectCancelledCeremony(error: unknown): never {
  const reason = (error as { error?: unknown } | null)?.error;
  if (
    reason === "UserCancelled" ||
    reason === "TimedOut" ||
    reason === "NoCredentials"
  ) {
    throw new MeraError(
      "PASSKEY_CANCELLED",
      "The passkey prompt was dismissed, timed out, or found no passkey",
      { cause: error },
    );
  }
  throw error;
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
