import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { base64UrlDecode, base64UrlEncode, copyBytes } from "./encoding.js";
import { isMeraError, MeraError } from "./errors.js";
import type {
  CreatePasskeyWithPrfOutputResult,
  PasskeyCredentialMetadata,
  PasskeyCredentialTransport,
  PasskeyPrfResult,
} from "./types.js";
import { randomBytes } from "./webcrypto.js";

const DEFAULT_PRF_SALT = sha256(utf8ToBytes("mera.prf.salt.v1"));

/** Inputs for creating a passkey and obtaining its first WebAuthn PRF output. */
type CreatePasskeyWithPrfOutputOptions = {
  /**
   * Relying party identity passed to WebAuthn. `id` is required so the
   * fallback assertion can target the same relying party.
   */
  rp: PublicKeyCredentialRpEntity & { id: string };
  /** User identity passed to WebAuthn. */
  user: {
    /** User name displayed or stored by the authenticator. */
    name: string;
    /** Human-readable display name for the authenticator UI. */
    displayName: string;
  };
  /** WebAuthn timeout in milliseconds. Browser defaults apply when omitted. */
  timeout?: number;
  /**
   * 32-byte PRF salt evaluated during creation, or by the fallback assertion.
   * Defaults to the fixed salt documented on {@link getPasskeyPrfOutput}.
   */
  prfSalt?: Uint8Array;
};

/** Inputs for requesting the first WebAuthn PRF output from a passkey. */
type GetPasskeyPrfOutputOptions = {
  /** Relying party ID for the WebAuthn assertion. */
  rpId: string;
  /**
   * Credential metadata to restrict the assertion to one passkey. When
   * omitted, WebAuthn may choose any discoverable credential for the relying
   * party.
   */
  credential?: PasskeyCredentialMetadata;
  /**
   * PRF salt as 32 raw bytes. Defaults to the fixed salt documented on
   * {@link getPasskeyPrfOutput}.
   */
  prfSalt?: Uint8Array;
  /** WebAuthn timeout in milliseconds. Browser defaults apply when omitted. */
  timeout?: number;
};

type PrfClientExtensionResults = AuthenticationExtensionsClientOutputs & {
  prf?: {
    enabled?: boolean;
    results?: {
      first?: BufferSource | ArrayLike<number>;
    };
  };
};

type PublicKeyCredentialWithPrf = PublicKeyCredential & {
  getClientExtensionResults(): PrfClientExtensionResults;
};

/**
 * Creates a discoverable, user-verified passkey that requires WebAuthn PRF
 * support and returns the first PRF output.
 *
 * @param options - Passkey creation inputs.
 * @returns Credential metadata and the first PRF output.
 * @remarks
 * Invokes `navigator.credentials.create()` and shows one user-verification
 * prompt. On authenticators that do not evaluate PRF during creation, a
 * fallback `navigator.credentials.get()` evaluates the same salt and shows a
 * second prompt.
 *
 * WebAuthn challenges and the credential's user handle (`user.id`) are
 * generated internally, 32 random bytes each. An authenticator overwrites a
 * discoverable credential that has the same `rp.id` and `user.id`, so a fresh
 * handle per call adds a passkey instead of replacing one.
 *
 * The credential is requested with fixed parameters: ES256 or RS256 key types,
 * attestation `"none"`, a required resident key, and required user
 * verification ({@link getPasskeyPrfOutput} explains the requirement).
 *
 * Any failure after the creation ceremony completes leaves the passkey on the
 * authenticator, but the thrown error does not carry its metadata.
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not enable PRF, returns a malformed create-time PRF output, or does not return PRF output on the fallback ceremony.
 * @throws MeraError with code `INPUT_INVALID` when an explicit `prfSalt` is not 32 bytes.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function createPasskeyWithPrfOutput({
  rp,
  user,
  timeout,
  prfSalt,
}: CreatePasskeyWithPrfOutputOptions): Promise<CreatePasskeyWithPrfOutputResult> {
  try {
    assertCredentialApiAvailable();

    if (prfSalt !== undefined && prfSalt.length !== 32) {
      throw new MeraError("INPUT_INVALID", "PRF salt must be 32 bytes");
    }

    const prfSaltCopy = copyBytes(prfSalt ?? DEFAULT_PRF_SALT);

    const credential = await navigator.credentials.create({
      publicKey: {
        rp,
        user: {
          id: randomBytes(32),
          name: user.name,
          displayName: user.displayName,
        },
        challenge: randomBytes(32),
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        ...(timeout !== undefined ? { timeout } : {}),
        attestation: "none",
        authenticatorSelection: {
          residentKey: "required",
          requireResidentKey: true,
          userVerification: "required",
        },
        extensions: {
          prf: { eval: { first: prfSaltCopy } },
        },
      },
    });

    const publicKeyCredential = assertPublicKeyCredential(credential);
    const prf = publicKeyCredential.getClientExtensionResults().prf;

    if (!prf?.enabled) {
      throw new MeraError(
        "PRF_UNAVAILABLE",
        "Authenticator did not enable PRF",
      );
    }

    const response =
      publicKeyCredential.response as AuthenticatorAttestationResponse;
    const transports =
      typeof response.getTransports === "function"
        ? response.getTransports()
        : undefined;
    const credentialMetadata = toCredentialMetadata(
      base64UrlEncode(new Uint8Array(publicKeyCredential.rawId)),
      transports,
    );

    const prfOutput = prf.results?.first
      ? copyPrfOutput(prf.results.first)
      : (
          await getPasskeyPrfOutput({
            rpId: rp.id,
            credential: credentialMetadata,
            prfSalt: prfSaltCopy,
            ...(timeout !== undefined ? { timeout } : {}),
          })
        ).prfOutput;

    return {
      ...credentialMetadata,
      prfSalt: prfSaltCopy,
      prfOutput,
    };
  } catch (error) {
    if (isMeraError(error)) {
      throw error;
    }

    throw new MeraError("PASSKEY_OPERATION_FAILED", "Passkey creation failed", {
      cause: error,
    });
  }
}

/**
 * Requests a passkey PRF evaluation and returns the first output.
 *
 * @param options - Passkey PRF request inputs.
 * @returns The selected credential ID and first WebAuthn PRF output.
 * @remarks
 * Invokes `navigator.credentials.get()` and shows one user-verification
 * prompt.
 *
 * The WebAuthn challenge is generated internally.
 *
 * The default salt is `sha256("mera.prf.salt.v1")` and will not change across
 * library versions. The PRF output is a deterministic function of the
 * credential, `rpId`, and salt; a different salt yields an unrelated output.
 *
 * The assertion requires user verification, and the requirement is not
 * configurable. User verification is the authenticator's local check; the
 * gesture depends on the platform (a biometric, a device PIN, or a password).
 * Authenticators built on CTAP's `hmac-secret` keep two PRFs per credential,
 * one for user-verified requests and one for the rest; WebAuthn exposes only
 * the user-verified PRF and overrides a weaker `userVerification` setting
 * when evaluating it, so a configurable setting could neither change the PRF
 * output nor skip the check.
 * @see {@link https://www.w3.org/TR/webauthn-3/#prf-extension | WebAuthn: the PRF extension}
 * @see {@link https://www.w3.org/TR/webauthn-3/#enumdef-userverificationrequirement | WebAuthn: UserVerificationRequirement}
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not return a usable 32-byte PRF output.
 * @throws MeraError with code `INPUT_INVALID` when an explicit `prfSalt` is not 32 bytes, or `credential.credentialId` is empty or not canonical base64url.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function getPasskeyPrfOutput({
  rpId,
  credential: allowCredential,
  prfSalt,
  timeout,
}: GetPasskeyPrfOutputOptions): Promise<PasskeyPrfResult> {
  try {
    assertCredentialApiAvailable();

    if (prfSalt !== undefined && prfSalt.length !== 32) {
      throw new MeraError("INPUT_INVALID", "PRF salt must be 32 bytes");
    }

    const prf = {
      eval: { first: copyBytes(prfSalt ?? DEFAULT_PRF_SALT) },
    };

    const publicKey: PublicKeyCredentialRequestOptions = {
      rpId,
      challenge: randomBytes(32),
      ...(timeout !== undefined ? { timeout } : {}),
      userVerification: "required",
      extensions: { prf },
    };

    if (allowCredential !== undefined) {
      // WebAuthn floors only randomly generated credential IDs at 16 bytes;
      // the encrypted-credential-source form has no stated minimum, so only
      // emptiness is rejected here: an empty ID must not silently widen the
      // assertion to any discoverable passkey. A short-but-nonempty ID fails
      // closed at the browser as a non-matching allowCredentials entry.
      // https://www.w3.org/TR/webauthn-3/#credential-id
      publicKey.allowCredentials = [
        {
          id: base64UrlDecode(allowCredential.credentialId, {
            name: "credential.credentialId",
            minByteLength: 1,
          }),
          type: "public-key",
          ...(allowCredential.transports !== undefined
            ? {
                // The library's transport type admits future strings beyond
                // lib.dom's closed AuthenticatorTransport union. The cast is
                // safe: transports are hints, and WebAuthn ignores values it
                // does not recognize.
                transports:
                  allowCredential.transports as AuthenticatorTransport[],
              }
            : {}),
        },
      ];
    }

    const credential = await navigator.credentials.get({ publicKey });
    const publicKeyCredential = assertPublicKeyCredential(credential);
    const first =
      publicKeyCredential.getClientExtensionResults().prf?.results?.first;

    if (!first) {
      throw new MeraError(
        "PRF_UNAVAILABLE",
        "Authenticator did not return PRF output",
      );
    }

    return {
      credentialId: base64UrlEncode(new Uint8Array(publicKeyCredential.rawId)),
      prfOutput: copyPrfOutput(first),
    };
  } catch (error) {
    if (isMeraError(error)) {
      throw error;
    }

    throw new MeraError(
      "PASSKEY_OPERATION_FAILED",
      "Passkey assertion failed",
      { cause: error },
    );
  }
}

/**
 * Builds credential metadata with a copied `transports` array.
 *
 * @internal
 */
function toCredentialMetadata(
  credentialId: string,
  transports: readonly PasskeyCredentialTransport[] | undefined,
): PasskeyCredentialMetadata {
  return {
    credentialId,
    ...(transports !== undefined ? { transports: [...transports] } : {}),
  };
}

/**
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable.
 */
function assertCredentialApiAvailable(): void {
  if (!globalThis.navigator?.credentials) {
    throw new MeraError("PASSKEY_OPERATION_FAILED", "WebAuthn is unavailable");
  }
}

/**
 * Narrows a WebAuthn result to a public-key credential with extension results.
 *
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn returned no usable public-key credential.
 */
function assertPublicKeyCredential(
  credential: Credential | null,
): PublicKeyCredentialWithPrf {
  if (credential?.type !== "public-key" || !("rawId" in credential)) {
    throw new MeraError(
      "PASSKEY_OPERATION_FAILED",
      "WebAuthn returned no public key credential",
    );
  }

  const publicKeyCredential = credential as PublicKeyCredentialWithPrf;

  if (typeof publicKeyCredential.getClientExtensionResults !== "function") {
    throw new MeraError(
      "PASSKEY_OPERATION_FAILED",
      "WebAuthn extension results are unavailable",
    );
  }

  return publicKeyCredential;
}

/**
 * Copies a WebAuthn PRF result into standalone 32-byte output.
 *
 * Authenticators surface PRF output inconsistently: most return an `ArrayBuffer`,
 * some return an `ArrayBufferView`, and others (notably the 1Password browser
 * extension) return a plain array of byte values. This normalizes all of them
 * into a fresh `Uint8Array`.
 *
 * The typed forms are already constrained to bytes. A plain array-like is not,
 * so each element is validated as an integer in [0, 255] while it is copied; a
 * bare `Uint8Array.from(value)` would instead silently coerce malformed values
 * (mod 256, `NaN` -> 0) into HKDF key material.
 *
 * @throws MeraError with code `PRF_UNAVAILABLE` when the output is not exactly
 * 32 bytes, or a plain array-like contains a value that is not an integer in
 * [0, 255].
 */
function copyPrfOutput(
  value: BufferSource | ArrayLike<number>,
): Uint8Array<ArrayBuffer> {
  let output: Uint8Array<ArrayBuffer>;

  if (ArrayBuffer.isView(value)) {
    output = copyBytes(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  } else if (value instanceof ArrayBuffer) {
    output = copyBytes(new Uint8Array(value));
  } else {
    output = Uint8Array.from(value, (byte) => {
      if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
        throw new MeraError(
          "PRF_UNAVAILABLE",
          "PRF output must contain only byte values (integers 0-255)",
        );
      }
      return byte;
    });
  }

  if (output.length !== 32) {
    throw new MeraError("PRF_UNAVAILABLE", "PRF output must be 32 bytes");
  }

  return output;
}

export type { CreatePasskeyWithPrfOutputOptions, GetPasskeyPrfOutputOptions };
export {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  toCredentialMetadata,
};
