import type {
  PasskeyCredentialTransport,
  WebAuthnClient,
} from "@category-labs/mera";
import { base64urlnopad } from "@scure/base";
import {
  Passkey,
  type PasskeyGetRequest,
  type PasskeyGetResult,
} from "react-native-passkey";

// react-native-passkey exports its request and result types but not the leaf
// types inside them, so these are read off the exported ones.
type NativeTransport = NonNullable<
  NonNullable<PasskeyGetRequest["allowCredentials"]>[number]["transports"]
>[number];
type NativePrfValue = NonNullable<
  NonNullable<
    NonNullable<PasskeyGetResult["clientExtensionResults"]>["prf"]
  >["results"]
>["first"];

// WebAuthn's registered transports, which are the values the native modules
// accept.
const NATIVE_TRANSPORTS: readonly string[] = [
  "ble",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb",
];

/**
 * mera's {@link WebAuthnClient} backed by the platform passkey APIs:
 * AuthenticationServices on iOS, Credential Manager on Android, both reached
 * through react-native-passkey.
 *
 * The native modules take most binary fields as base64url strings, so this
 * client is an encoding layer and nothing else. Every ceremony parameter comes
 * from the request. The PRF salt is the one field that crosses as bytes; see
 * {@link prfExtension}.
 */
const nativePasskeyClient: WebAuthnClient = {
  async createCredential(request) {
    // createPlatformKey rather than create: create offers a security key in the
    // same sheet, and iOS builds PRF results only for platform credentials, so
    // a security key would answer with no PRF output at all.
    const created = await Passkey.createPlatformKey({
      rp: request.rp,
      user: {
        id: encodeBase64Url(request.user.id),
        name: request.user.name,
        displayName: request.user.displayName,
      },
      challenge: encodeBase64Url(request.challenge),
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
      credentialId: decodeBase64Url(created.rawId ?? created.id),
      ...(transports !== undefined ? { transports } : {}),
      prfEnabled: prf?.enabled === true,
      ...(prfOutput !== undefined ? { prfOutput } : {}),
    };
  },

  async getCredential(request) {
    const { allowCredential } = request;

    // getPlatformKey for the same reason createCredential uses createPlatformKey.
    const asserted = await Passkey.getPlatformKey({
      rpId: request.rpId,
      challenge: encodeBase64Url(request.challenge),
      userVerification: request.userVerification,
      extensions: prfExtension(request.prfSalt),
      ...(allowCredential !== undefined
        ? {
            allowCredentials: [
              {
                type: "public-key" as const,
                id: encodeBase64Url(allowCredential.credentialId),
                ...(allowCredential.transports !== undefined
                  ? { transports: knownTransports(allowCredential.transports) }
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
      credentialId: decodeBase64Url(asserted.rawId ?? asserted.id),
      ...(prfOutput !== undefined ? { prfOutput } : {}),
    };
  },
};

function encodeBase64Url(value: Uint8Array): string {
  return base64urlnopad.encode(value);
}

/**
 * The PRF extension for a ceremony request, carrying the salt as bytes where
 * every other binary field crosses as base64url.
 *
 * react-native-passkey rewrites binary request fields to base64url only when
 * the platform is Android. On iOS the request reaches Swift as whatever
 * `JSON.stringify` made of it, and Swift decodes `first` only as an
 * index-keyed dictionary of byte values, which is exactly what a `Uint8Array`
 * stringifies to. A base64url string raises a type mismatch there and the
 * ceremony fails; a plain array stringifies to a JSON array and an
 * `ArrayBuffer` to `{}`, so neither works either. Bytes are the one shape both
 * platforms read.
 */
function prfExtension(prfSalt: Uint8Array): {
  prf: { eval: { first: Uint8Array } };
} {
  return { prf: { eval: { first: prfSalt } } };
}

/**
 * Decodes what a native provider returned as base64url. Padding and the
 * standard `+/` alphabet both turn up in practice, so both are normalized away
 * before decoding.
 */
function decodeBase64Url(value: string): Uint8Array {
  return base64urlnopad.decode(
    value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  );
}

/**
 * Reads a PRF result. The native modules document base64url strings; the other
 * shapes their type admits are accepted rather than trusted, and a plain array
 * is checked byte by byte instead of being coerced into key material.
 */
function readPrfOutput(
  value: NativePrfValue | undefined,
): Uint8Array | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return decodeBase64Url(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);

  return Uint8Array.from(value, (byte) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw new Error("PRF output must contain only byte values");
    }
    return byte;
  });
}

/**
 * Keeps only the transports WebAuthn has registered. mera's transport type
 * admits any string, and transports are hints, so dropping an unrecognized one
 * costs the platform nothing but a hint about where to look for the passkey.
 */
function knownTransports(
  transports: readonly PasskeyCredentialTransport[],
): NativeTransport[] {
  return transports.filter((transport): transport is NativeTransport =>
    NATIVE_TRANSPORTS.includes(transport),
  );
}

export { nativePasskeyClient };
