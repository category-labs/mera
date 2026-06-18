import { asArrayBuffer, base64UrlDecode, base64UrlEncode } from "./encoding.js";
import { isPasskeyAccountError, PasskeyAccountError } from "./errors.js";
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
    /** Stable user handle for the relying party. Must be 1 to 64 bytes when provided. Defaults to 32 cryptographically random bytes. */
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
   * Optional 32-byte PRF salt to evaluate during creation. When provided and the authenticator supports PRF eval at create time, the returned `prfOutput` lets a derived-mode flow open the account in a single ceremony.
   *
   * Authenticators that do not support PRF eval during creation silently ignore this field; callers should fall back to `getPasskeyPrfOutput` if `prfOutput` is undefined.
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
 * When `prfSalt` is provided and the authenticator supports PRF eval at create time, the result includes `prfOutput` and a derived-mode flow can open the account without a second ceremony.
 *
 * @param options - Passkey creation inputs.
 * @param options.rp - Relying party identity passed to WebAuthn.
 * @param options.user - User identity passed to WebAuthn.
 * @param options.user.id - Stable relying-party user handle. Must be 1 to 64 bytes when provided. Defaults to 32 cryptographically random bytes.
 * @param options.user.name - User name displayed or stored by the authenticator.
 * @param options.user.displayName - Human-readable display name for the authenticator UI.
 * @param options.challenge - WebAuthn challenge. Defaults to 32 cryptographically random bytes.
 * @param options.timeout - WebAuthn timeout in milliseconds. Browser defaults apply when omitted.
 * @param options.attestation - WebAuthn attestation preference. Defaults to `"none"`.
 * @param options.prfSalt - Optional 32-byte PRF salt to evaluate at create time.
 * @returns Credential metadata and, when `prfSalt` was provided and the authenticator supports it, the first PRF output.
 * @remarks Side effects: invokes `navigator.credentials.create()`, which may show browser or authenticator UI and create a discoverable passkey.
 * @remarks Caller assumptions: call from a secure browser context where WebAuthn and PRF are available.
 * @throws PasskeyAccountError with code `PRF_UNAVAILABLE` when the authenticator does not enable PRF.
 * @throws PasskeyAccountError with code `INPUT_INVALID` when `prfSalt` is provided but not 32 bytes, or `user.id` is provided but not 1 to 64 bytes.
 * @throws PasskeyAccountError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
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
      throw new PasskeyAccountError(
        "INPUT_INVALID",
        "PRF salt must be 32 bytes",
      );
    }

    if (user.id !== undefined && (user.id.length < 1 || user.id.length > 64)) {
      throw new PasskeyAccountError(
        "INPUT_INVALID",
        "user.id must be 1 to 64 bytes",
      );
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
      throw new PasskeyAccountError(
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
      const prfOutput = copyPrfOutput(prf.results.first);
      if (prfOutput.length !== 32) {
        throw new PasskeyAccountError(
          "PRF_UNAVAILABLE",
          "PRF output must be 32 bytes",
        );
      }
      result.prfOutput = prfOutput;
    }

    return result;
  } catch (error) {
    if (isPasskeyAccountError(error)) {
      throw error;
    }

    throw new PasskeyAccountError(
      "PASSKEY_OPERATION_FAILED",
      "Passkey creation failed",
      { cause: error },
    );
  }
}

/**
 * Performs a passkey assertion and returns the first WebAuthn PRF output.
 *
 * When `credentialId` is omitted, WebAuthn may choose any discoverable credential for the relying party.
 *
 * @param options - Passkey assertion inputs.
 * @param options.rpId - Relying party ID for the WebAuthn assertion.
 * @param options.credentialId - Optional credential ID to restrict the assertion to one passkey.
 * @param options.transports - Optional transports associated with `credentialId`.
 * @param options.prfSalt - PRF salt. Must be exactly 32 bytes.
 * @param options.challenge - WebAuthn challenge. Defaults to 32 cryptographically random bytes.
 * @param options.timeout - WebAuthn timeout in milliseconds. Browser defaults apply when omitted.
 * @returns The selected credential ID and first WebAuthn PRF output.
 * @remarks Side effects: invokes `navigator.credentials.get()`, which may show browser or authenticator UI.
 * @remarks Caller assumptions: `prfSalt` must be stable for flows that need stable PRF output.
 * @throws PasskeyAccountError with code `PRF_UNAVAILABLE` when the authenticator does not return a 32-byte PRF output.
 * @throws PasskeyAccountError with code `INPUT_INVALID` when `prfSalt` is not 32 bytes or `credentialId` is not canonical base64url.
 * @throws PasskeyAccountError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
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
      throw new PasskeyAccountError(
        "INPUT_INVALID",
        "PRF salt must be 32 bytes",
      );
    }

    const prf = { eval: { first: asArrayBuffer(prfSalt) } };

    const publicKey: PublicKeyCredentialRequestOptions = {
      rpId,
      challenge: asArrayBuffer(challenge),
      timeout,
      userVerification: "required",
      extensions: { prf },
    };

    if (credentialId) {
      publicKey.allowCredentials = [
        {
          id: asArrayBuffer(base64UrlDecode(credentialId)),
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
      throw new PasskeyAccountError(
        "PRF_UNAVAILABLE",
        "Authenticator did not return PRF output",
      );
    }

    const prfOutput = copyPrfOutput(first);
    if (prfOutput.length !== 32) {
      throw new PasskeyAccountError(
        "PRF_UNAVAILABLE",
        "PRF output must be 32 bytes",
      );
    }

    return {
      credentialId: base64UrlEncode(new Uint8Array(publicKeyCredential.rawId)),
      prfOutput,
    };
  } catch (error) {
    if (isPasskeyAccountError(error)) {
      throw error;
    }

    throw new PasskeyAccountError(
      "PASSKEY_OPERATION_FAILED",
      "Passkey assertion failed",
      { cause: error },
    );
  }
}

/**
 * Creates a passkey and returns the first WebAuthn PRF output, falling back to a second ceremony only when the authenticator does not evaluate PRF at create time.
 *
 * This is the canonical "open this account right after creating it" entry point. It is equivalent to calling `createPasskey` and, when `prfOutput` is undefined, `getPasskeyPrfOutput` with the same salt. The lower-level entry points remain available for callers that want to drive the two ceremonies independently (for example, to show UI between them).
 *
 * @param options - Passkey creation inputs. `rp.id` is required so the fallback ceremony can target the same relying party. `prfSalt` must be exactly 32 bytes.
 * @returns Credential metadata and the first PRF output.
 * @remarks Side effects: invokes `navigator.credentials.create()`. On authenticators that do not evaluate PRF during creation, also invokes `navigator.credentials.get()` — which means a second browser prompt for the user.
 * @remarks Caller assumptions: call from a secure browser context where WebAuthn and PRF are available.
 * @throws PasskeyAccountError with code `PRF_UNAVAILABLE` when the authenticator does not enable PRF, or does not return PRF output on the fallback ceremony.
 * @throws PasskeyAccountError with code `INPUT_INVALID` when `prfSalt` is not 32 bytes, or `user.id` is provided but not 1 to 64 bytes.
 * @throws PasskeyAccountError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function createPasskeyWithPrfOutput({
  rp,
  user,
  challenge,
  timeout,
  attestation,
  prfSalt,
}: CreatePasskeyWithPrfOutputInput): Promise<CreatePasskeyWithPrfOutputResult> {
  const credential = await createPasskey({
    rp,
    user,
    challenge,
    timeout,
    attestation,
    prfSalt,
  });

  const prfOutput =
    credential.prfOutput ??
    (
      await getPasskeyPrfOutput({
        rpId: rp.id,
        credentialId: credential.credentialId,
        transports: credential.transports,
        prfSalt,
        timeout,
      })
    ).prfOutput;

  const result: CreatePasskeyWithPrfOutputResult = {
    credentialId: credential.credentialId,
    // Copy so the returned salt is stable even if the caller mutates theirs.
    prfSalt: new Uint8Array(prfSalt),
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
 * @throws PasskeyAccountError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable.
 */
function assertCredentialApiAvailable(): void {
  if (!globalThis.navigator?.credentials) {
    throw new PasskeyAccountError(
      "PASSKEY_OPERATION_FAILED",
      "WebAuthn is unavailable",
    );
  }
}

/**
 * Narrows a WebAuthn result to a public-key credential with extension results.
 *
 * @param credential - Credential returned by WebAuthn.
 * @returns The credential narrowed to the PRF-aware public-key credential shape.
 * @throws PasskeyAccountError with code `PASSKEY_OPERATION_FAILED` when WebAuthn returned no usable public-key credential.
 */
function assertPublicKeyCredential(
  credential: Credential | null,
): PublicKeyCredentialWithPrf {
  if (credential?.type !== "public-key" || !("rawId" in credential)) {
    throw new PasskeyAccountError(
      "PASSKEY_OPERATION_FAILED",
      "WebAuthn returned no public key credential",
    );
  }

  const publicKeyCredential = credential as PublicKeyCredentialWithPrf;

  if (typeof publicKeyCredential.getClientExtensionResults !== "function") {
    throw new PasskeyAccountError(
      "PASSKEY_OPERATION_FAILED",
      "WebAuthn extension results are unavailable",
    );
  }

  return publicKeyCredential;
}

/**
 * Copies a WebAuthn PRF result into standalone bytes.
 *
 * Authenticators surface PRF output inconsistently: most return an `ArrayBuffer`,
 * some return an `ArrayBufferView`, and others (notably the 1Password browser
 * extension) return a plain array of byte values. This normalizes all of them
 * into a fresh `Uint8Array` that never aliases the input.
 *
 * @internal
 */
function copyPrfOutput(value: BufferSource | ArrayLike<number>): Uint8Array {
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
    );
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0));
  }

  return Uint8Array.from(value);
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
