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
  PasskeyCredentialTransport,
  PasskeyPrfResult,
} from "./types.js";
import { randomBytes } from "./webcrypto.js";

/** Inputs for creating a discoverable, user-verified passkey with PRF enabled. */
type CreatePasskeyInput = {
  /** Relying party identity passed directly to WebAuthn. */
  rp: PublicKeyCredentialRpEntity;
  /** User identity passed to WebAuthn. `id` is copied before use. */
  user: {
    /** Stable user handle for the relying party. Must be 1 to 64 bytes when provided (WebAuthn's user-handle limit). Defaults to 32 cryptographically random bytes. */
    id?: Uint8Array;
    /** User name displayed or stored by the authenticator. */
    name: string;
    /** Human-readable display name for the authenticator UI. */
    displayName: string;
  };
  /** WebAuthn challenge. Defaults to 32 cryptographically random bytes. */
  challenge?: Uint8Array;
  /** WebAuthn timeout in milliseconds. Browser defaults apply when omitted. */
  timeout?: number;
  /** WebAuthn attestation preference. Defaults to `"none"`. */
  attestation?: AttestationConveyancePreference;
  /**
   * Optional 32-byte PRF salt to evaluate during creation. Authenticators that
   * do not support PRF eval at create time silently ignore it and the result
   * omits `prfOutput`; a later `getPasskeyPrfOutput` with the same `rpId`,
   * `credentialId`, and salt yields the PRF output.
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
  /** Optional credential ID (canonical unpadded base64url) to restrict the assertion to one passkey. */
  credentialId?: string;
  /** Optional transports associated with `credentialId`. */
  transports?: PasskeyCredentialTransport[];
  /** PRF salt as 32 raw bytes. */
  prfSalt: Uint8Array;
  /** WebAuthn challenge. Defaults to 32 cryptographically random bytes. */
  challenge?: Uint8Array;
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
 * When `prfSalt` is provided and the authenticator evaluates PRF at create
 * time, the result includes the first PRF output, so no second ceremony is
 * needed to open a derived account.
 *
 * @param options - Passkey creation inputs; fields are documented on {@link CreatePasskeyOptions}.
 * @returns Credential metadata, plus the first PRF output when it was evaluated during creation.
 * @remarks
 * Invokes `navigator.credentials.create()`, which may show browser or
 * authenticator UI and create a discoverable passkey.
 *
 * The credential is requested with fixed parameters: ES256 or RS256 key types,
 * a required resident key, and required user verification.
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not enable PRF, or returns a malformed create-time PRF output.
 * @throws MeraError with code `INPUT_INVALID` when `prfSalt` is provided but not 32 bytes, or `user.id` is provided but not 1 to 64 bytes.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function createPasskey({
  rp,
  user,
  challenge = randomBytes(32),
  timeout,
  attestation = "none",
  prfSalt,
}: CreatePasskeyInput): Promise<CreatePasskeyResult> {
  try {
    assertCredentialApiAvailable();

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
        timeout,
        attestation,
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

    const result: CreatePasskeyResult = {
      credentialId: base64UrlEncode(new Uint8Array(publicKeyCredential.rawId)),
    };

    if (transports !== undefined) {
      result.transports = transports;
    }

    if (prfSalt !== undefined && prf.results?.first) {
      result.prfOutput = copyPrfOutput(prf.results.first);
    }

    return result;
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
 * When `credentialId` is omitted, WebAuthn may choose any discoverable credential for the relying party.
 *
 * @param options - Passkey PRF request inputs; fields are documented on {@link GetPasskeyPrfOutputOptions}.
 * @returns The selected credential ID and first WebAuthn PRF output.
 * @remarks
 * Invokes `navigator.credentials.get()`, which may show browser or
 * authenticator UI.
 *
 * The PRF output is a deterministic function of the credential, `rpId`, and
 * `prfSalt`: the same three inputs reproduce the same output, and a different
 * salt yields an unrelated output.
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not return a usable 32-byte PRF output.
 * @throws MeraError with code `INPUT_INVALID` when `prfSalt` is not 32 bytes, or `credentialId` is empty or not canonical base64url.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function getPasskeyPrfOutput({
  rpId,
  credentialId,
  transports,
  prfSalt,
  challenge = randomBytes(32),
  timeout,
}: GetPasskeyPrfOutputInput): Promise<PasskeyPrfResult> {
  try {
    assertCredentialApiAvailable();

    if (prfSalt.length !== 32) {
      throw new MeraError("INPUT_INVALID", "PRF salt must be 32 bytes");
    }

    const prf = { eval: { first: asArrayBuffer(prfSalt) } };

    const publicKey: PublicKeyCredentialRequestOptions = {
      rpId,
      challenge: asArrayBuffer(challenge),
      timeout,
      userVerification: "required",
      extensions: { prf },
    };

    if (credentialId !== undefined) {
      // WebAuthn floors only randomly generated credential IDs at 16 bytes;
      // the encrypted-credential-source form has no stated minimum, so only
      // emptiness is rejected here: an empty ID must not silently widen the
      // assertion to any discoverable passkey. A short-but-nonempty ID fails
      // closed at the browser as a non-matching allowCredentials entry.
      // https://www.w3.org/TR/webauthn-3/#credential-id
      publicKey.allowCredentials = [
        {
          id: asArrayBuffer(
            base64UrlDecode(credentialId, { minByteLength: 1 }),
          ),
          type: "public-key",
          transports: transports as AuthenticatorTransport[] | undefined,
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
 * @param options - Passkey creation inputs; fields are documented on {@link CreatePasskeyWithPrfOutputOptions}. `rp.id` is required so the fallback ceremony can target the same relying party. `prfSalt` must be exactly 32 bytes.
 * @returns Credential metadata and the first PRF output.
 * @remarks
 * Invokes `navigator.credentials.create()`. On authenticators that do not
 * evaluate PRF during creation, also invokes `navigator.credentials.get()` — a
 * second browser prompt.
 *
 * `prfSalt` is copied before async WebAuthn work starts; post-call mutation of
 * the input does not change the fallback ceremony or returned salt.
 *
 * If the fallback ceremony fails, the passkey from the completed creation
 * ceremony still exists on the authenticator, but the thrown error does not
 * carry its metadata; composing `createPasskey` and `getPasskeyPrfOutput`
 * directly keeps the credential ID across that failure.
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not enable PRF, or does not return PRF output on the fallback ceremony.
 * @throws MeraError with code `INPUT_INVALID` when `prfSalt` is not 32 bytes, or `user.id` is provided but not 1 to 64 bytes.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function createPasskeyWithPrfOutput({
  rp,
  user,
  challenge,
  timeout,
  attestation,
  prfSalt,
}: CreatePasskeyWithPrfOutputInput): Promise<CreatePasskeyWithPrfOutputResult> {
  const prfSaltCopy = copyBytes(prfSalt);

  const credential = await createPasskey({
    rp,
    user,
    challenge,
    timeout,
    attestation,
    prfSalt: prfSaltCopy,
  });

  const prfOutput =
    credential.prfOutput ??
    (
      await getPasskeyPrfOutput({
        rpId: rp.id,
        credentialId: credential.credentialId,
        transports: credential.transports,
        prfSalt: prfSaltCopy,
        timeout,
      })
    ).prfOutput;

  const result: CreatePasskeyWithPrfOutputResult = {
    credentialId: credential.credentialId,
    prfSalt: prfSaltCopy,
    prfOutput,
  };

  if (credential.transports !== undefined) {
    result.transports = credential.transports;
  }

  return result;
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
function copyPrfOutput(value: BufferSource | ArrayLike<number>): Uint8Array {
  let output: Uint8Array;

  if (ArrayBuffer.isView(value)) {
    output = new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  } else if (value instanceof ArrayBuffer) {
    output = new Uint8Array(value.slice(0));
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

/** Options accepted by `createPasskey`. */
type CreatePasskeyOptions = Parameters<typeof createPasskey>[0];
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
