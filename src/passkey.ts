import {
  asArrayBuffer,
  base64UrlDecode,
  base64UrlEncode,
  copyBytes,
} from "./encoding.js";
import { isMeraError, MeraError } from "./errors.js";
import type {
  CreatePasskeyResult,
  CreatePasskeyWithPrfOutputResult,
  PasskeyCredentialMetadata,
  PasskeyPrfResult,
} from "./types.js";
import { randomBytes } from "./webcrypto.js";

/** Inputs for creating a discoverable, user-verified passkey with PRF enabled. */
type CreatePasskeyInput = {
  /** Relying party identity passed directly to WebAuthn. */
  rp: PublicKeyCredentialRpEntity;
  /** User identity passed to WebAuthn. `id` is copied before use. */
  user: {
    /**
     * User handle for the relying party. Must be 1 to 64 bytes when provided
     * (WebAuthn's user-handle limit).
     *
     * This value is stored as the WebAuthn user handle for the discoverable
     * credential. When omitted, a fresh 32-byte random handle is generated for
     * each call, so repeated calls do not share a stable user handle. The
     * generated handle is not correlated with an app account.
     */
    id?: Uint8Array;
    /** User name displayed or stored by the authenticator. */
    name: string;
    /** Human-readable display name for the authenticator UI. */
    displayName: string;
  };
  /** WebAuthn timeout in milliseconds. Browser defaults apply when omitted. */
  timeout?: number;
  /**
   * 32-byte PRF salt to evaluate during creation. Authenticators that
   * do not support PRF eval at create time silently ignore it and the result
   * omits `prfOutput`; a later `getPasskeyPrfOutput` with the same `rpId`,
   * `credentialId`, and salt yields the PRF output.
   *
   * Copied before use; the original buffer is not modified.
   */
  prfSalt?: Uint8Array;
};

/**
 * Inputs for creating a passkey and obtaining its first WebAuthn PRF output in one call.
 *
 * Tightens `CreatePasskeyOptions`: `rp.id` is required so the fallback ceremony
 * can target the same relying party, and `prfSalt` is required so apps choose
 * whether this flow is deterministic or random-key.
 */
type CreatePasskeyWithPrfOutputInput = Omit<
  CreatePasskeyInput,
  "rp" | "prfSalt"
> & {
  /** Relying party identity passed to WebAuthn. `id` is required here. */
  rp: PublicKeyCredentialRpEntity & { id: string };
  /** 32-byte PRF salt evaluated during creation, or by the fallback assertion. */
  prfSalt: Uint8Array;
};

/** Inputs for requesting the first WebAuthn PRF output from a passkey. */
type GetPasskeyPrfOutputInput = {
  /** Relying party ID for the WebAuthn assertion. */
  rpId: string;
  /** Credential metadata to restrict the assertion to one passkey. */
  credential?: PasskeyCredentialMetadata;
  /** PRF salt as 32 raw bytes; copied before use, the original buffer is not modified. */
  prfSalt: Uint8Array;
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
 * Creates a discoverable, user-verified passkey and requires WebAuthn PRF support.
 *
 * When the authenticator evaluates PRF at create time, the result includes the
 * first PRF output for `prfSalt`, so no second ceremony is needed to obtain the
 * PRF output.
 *
 * @param options - Passkey creation inputs; fields are documented on {@link CreatePasskeyOptions}.
 * @returns Credential metadata, plus the first PRF output when it was evaluated during creation.
 * @remarks
 * Invokes `navigator.credentials.create()`, which may show browser or
 * authenticator UI.
 *
 * The WebAuthn challenge is generated internally. The raw attestation response
 * is not returned.
 *
 * The credential is requested with fixed parameters: ES256 or RS256 key types,
 * attestation `"none"`, a required resident key, and required user
 * verification. User verification is the authenticator's local check; the
 * gesture depends on the platform (a biometric, a device PIN, or a password).
 * The requirement is not configurable because the PRF extension always
 * evaluates the credential's user-verified PRF and overrides a weaker
 * `userVerification` setting, so exposing the setting could neither change
 * the PRF output nor remove the check.
 * @see {@link https://www.w3.org/TR/webauthn-3/#user-verification | WebAuthn: user verification}
 * @see {@link https://www.w3.org/TR/webauthn-3/#prf-extension | WebAuthn: the PRF extension}
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not enable PRF, or returns a malformed create-time PRF output.
 * @throws MeraError with code `INPUT_INVALID` when `prfSalt` is not 32 bytes, or `user.id` is provided but not 1 to 64 bytes.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
function createPasskey(
  options: CreatePasskeyInput & { prfSalt: Uint8Array },
): Promise<CreatePasskeyResult>;
/**
 * Creates a discoverable, user-verified passkey and requires WebAuthn PRF support.
 *
 * Without `prfSalt`, no PRF evaluation happens during creation, so the result
 * carries credential metadata only; a later `getPasskeyPrfOutput` call with a
 * salt produces PRF output for this passkey.
 *
 * @param options - Passkey creation inputs; fields are documented on {@link CreatePasskeyOptions}.
 * @returns Credential metadata for the created passkey.
 * @remarks
 * The ceremony is the one documented on the `prfSalt` overload: the same
 * browser or authenticator UI, internally generated challenge, and fixed
 * WebAuthn parameters, minus the PRF salt evaluation.
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not enable PRF.
 * @throws MeraError with code `INPUT_INVALID` when `user.id` is provided but not 1 to 64 bytes.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
function createPasskey(
  options: Omit<CreatePasskeyInput, "prfSalt"> & { prfSalt?: never },
): Promise<PasskeyCredentialMetadata>;
/**
 * Creates a discoverable, user-verified passkey and requires WebAuthn PRF support.
 *
 * Fallback overload for options where `prfSalt` presence is not statically
 * known. The ceremony and failure modes are the ones documented on the
 * `prfSalt` overload, with the salt evaluated only when present.
 *
 * @param options - Passkey creation inputs; fields are documented on {@link CreatePasskeyOptions}.
 * @returns Credential metadata, plus the first PRF output when `prfSalt` was provided and evaluated during creation.
 */
function createPasskey(
  options: CreatePasskeyInput,
): Promise<CreatePasskeyResult>;
async function createPasskey({
  rp,
  user,
  timeout,
  prfSalt,
}: CreatePasskeyInput): Promise<CreatePasskeyResult> {
  try {
    assertCredentialApiAvailable();

    const challenge = randomBytes(32);
    if (prfSalt !== undefined && prfSalt.length !== 32) {
      throw new MeraError("INPUT_INVALID", "PRF salt must be 32 bytes");
    }

    if (user.id !== undefined && (user.id.length < 1 || user.id.length > 64)) {
      throw new MeraError("INPUT_INVALID", "user.id must be 1 to 64 bytes");
    }

    const prfExtension =
      prfSalt !== undefined ? { eval: { first: asArrayBuffer(prfSalt) } } : {};

    const credential = await navigator.credentials.create({
      publicKey: {
        rp,
        user: {
          id: asArrayBuffer(user.id ?? randomBytes(32)),
          name: user.name,
          displayName: user.displayName,
        },
        challenge: asArrayBuffer(challenge),
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
          prf: prfExtension,
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

    return {
      credentialId: base64UrlEncode(new Uint8Array(publicKeyCredential.rawId)),
      ...(transports !== undefined ? { transports } : {}),
      ...(prfSalt !== undefined && prf.results?.first
        ? { prfOutput: copyPrfOutput(prf.results.first) }
        : {}),
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
 * When `credential` is omitted, WebAuthn may choose any discoverable credential for the relying party.
 *
 * @param options - Passkey PRF request inputs; fields are documented on {@link GetPasskeyPrfOutputOptions}.
 * @returns The selected credential ID and first WebAuthn PRF output.
 * @remarks
 * Invokes `navigator.credentials.get()`, which may show browser or
 * authenticator UI.
 *
 * The WebAuthn challenge is generated internally. The raw assertion response is
 * not returned.
 *
 * The PRF output is a deterministic function of the credential, `rpId`, and
 * `prfSalt`: the same three inputs reproduce the same output, and a different
 * salt yields an unrelated output.
 *
 * The assertion requires user verification, and the requirement is not
 * configurable. Authenticators built on CTAP's `hmac-secret` keep two PRFs
 * per credential, one for user-verified requests and one for the rest;
 * WebAuthn exposes only the user-verified PRF and overrides a weaker
 * `userVerification` setting when evaluating it. A configurable setting could
 * therefore neither change the PRF output nor skip the user-verification
 * check.
 * @see {@link https://www.w3.org/TR/webauthn-3/#prf-extension | WebAuthn: the PRF extension}
 * @see {@link https://www.w3.org/TR/webauthn-3/#enumdef-userverificationrequirement | WebAuthn: UserVerificationRequirement}
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not return a usable 32-byte PRF output.
 * @throws MeraError with code `INPUT_INVALID` when `prfSalt` is not 32 bytes, or `credential.credentialId` is empty or not canonical base64url.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function getPasskeyPrfOutput({
  rpId,
  credential: allowCredential,
  prfSalt,
  timeout,
}: GetPasskeyPrfOutputInput): Promise<PasskeyPrfResult> {
  try {
    const challenge = randomBytes(32);

    assertCredentialApiAvailable();

    if (prfSalt.length !== 32) {
      throw new MeraError("INPUT_INVALID", "PRF salt must be 32 bytes");
    }

    const prf = { eval: { first: asArrayBuffer(prfSalt) } };

    const publicKey: PublicKeyCredentialRequestOptions = {
      rpId,
      challenge: asArrayBuffer(challenge),
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
          id: asArrayBuffer(
            base64UrlDecode(allowCredential.credentialId, {
              minByteLength: 1,
            }),
          ),
          type: "public-key",
          ...(allowCredential.transports !== undefined
            ? {
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
 * Creates a passkey and returns the first WebAuthn PRF output, falling back to
 * a second ceremony only when the authenticator does not evaluate PRF at create
 * time. Equivalent to `createPasskey` followed, when `prfOutput` is absent, by
 * `getPasskeyPrfOutput` with the same salt.
 *
 * @param options - Passkey creation inputs; fields are documented on {@link CreatePasskeyWithPrfOutputOptions}.
 * @returns Credential metadata and the first PRF output.
 * @remarks
 * Invokes `navigator.credentials.create()`. On authenticators that do not
 * evaluate PRF during creation, also invokes `navigator.credentials.get()`,
 * which means a second browser prompt.
 *
 * WebAuthn challenges are generated internally. Raw attestation and assertion
 * responses are not returned.
 *
 * `prfSalt` is copied before async WebAuthn work starts; post-call mutation of
 * the input does not change the fallback ceremony or returned salt.
 *
 * If the fallback ceremony fails, the passkey from the completed creation
 * ceremony still exists on the authenticator, but the thrown error does not
 * carry its metadata.
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not enable PRF, or does not return PRF output on the fallback ceremony.
 * @throws MeraError with code `INPUT_INVALID` when `prfSalt` is not 32 bytes, or `user.id` is provided but not 1 to 64 bytes.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function createPasskeyWithPrfOutput({
  rp,
  user,
  timeout,
  prfSalt,
}: CreatePasskeyWithPrfOutputInput): Promise<CreatePasskeyWithPrfOutputResult> {
  const prfSaltCopy = copyBytes(prfSalt);

  const credential = await createPasskey({
    rp,
    user,
    ...(timeout !== undefined ? { timeout } : {}),
    prfSalt: prfSaltCopy,
  });

  const prfOutput =
    credential.prfOutput ??
    (
      await getPasskeyPrfOutput({
        rpId: rp.id,
        credential: {
          credentialId: credential.credentialId,
          ...(credential.transports !== undefined
            ? { transports: credential.transports }
            : {}),
        },
        prfSalt: prfSaltCopy,
        ...(timeout !== undefined ? { timeout } : {}),
      })
    ).prfOutput;

  return {
    credentialId: credential.credentialId,
    ...(credential.transports !== undefined
      ? { transports: credential.transports }
      : {}),
    prfSalt: prfSaltCopy,
    prfOutput,
  };
}

/**
 * Asserts that the WebAuthn credential API is available.
 *
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
 * @param credential - Credential returned by WebAuthn.
 * @returns The credential narrowed to the PRF-aware public-key credential shape.
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
 * into a fresh `Uint8Array` that never aliases the input.
 *
 * The typed forms are already constrained to bytes. A plain array-like is not,
 * so each element is validated as an integer in [0, 255] while it is copied; a
 * bare `Uint8Array.from(value)` would instead silently coerce malformed values
 * (mod 256, `NaN` -> 0) into HKDF key material.
 *
 * @throws MeraError with code `PRF_UNAVAILABLE` when the output is not exactly
 * 32 bytes, or a plain array-like contains a value that is not an integer in
 * [0, 255].
 * @internal
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

/**
 * Options accepted by `createPasskey`.
 *
 * Aliased directly rather than via `Parameters<typeof createPasskey>[0]`
 * because `Parameters` sees only the last overload.
 */
type CreatePasskeyOptions = CreatePasskeyInput;
/** Options accepted by `createPasskeyWithPrfOutput`. */
type CreatePasskeyWithPrfOutputOptions = Parameters<
  typeof createPasskeyWithPrfOutput
>[0];
/** Options accepted by `getPasskeyPrfOutput`. */
type GetPasskeyPrfOutputOptions = Parameters<typeof getPasskeyPrfOutput>[0];

export type {
  CreatePasskeyOptions,
  CreatePasskeyWithPrfOutputOptions,
  GetPasskeyPrfOutputOptions,
};
export {
  copyPrfOutput,
  createPasskey,
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
};
