import { MeraError } from "./errors.js";
import type {
  PasskeyCredentialTransport,
  PasskeyRelyingParty,
} from "./types.js";

/** Ceremony parameters for creating one passkey and evaluating its PRF. */
type WebAuthnCreateCredentialRequest = {
  /** Relying party identity for the new credential. */
  rp: PasskeyRelyingParty;
  /** User identity stored with the discoverable credential. */
  user: { id: Uint8Array; name: string; displayName: string };
  /** Challenge as raw bytes. */
  challenge: Uint8Array;
  /** COSE algorithm identifiers for the credential key, most preferred first. */
  algorithms: readonly number[];
  /** PRF salt to evaluate during creation, as 32 raw bytes. */
  prfSalt: Uint8Array;
  /** Discoverable-credential requirement. */
  residentKey: "required";
  /** User-verification requirement. */
  userVerification: "required";
  /** Attestation conveyance preference. */
  attestation: "none";
  /** Timeout in milliseconds. Platform defaults apply when omitted. */
  timeout?: number;
};

/** Outcome of one credential-creation ceremony. */
type WebAuthnCreateCredentialResult = {
  /** Credential ID of the new passkey, as raw bytes. */
  credentialId: Uint8Array;
  /** Authenticator transports reported for the new credential. */
  transports?: readonly PasskeyCredentialTransport[];
  /** Whether the authenticator enabled PRF for the new credential. */
  prfEnabled: boolean;
  /** First PRF output, when the authenticator evaluated the salt during creation. */
  prfOutput?: Uint8Array;
};

/** Credential an assertion is restricted to. */
type WebAuthnAllowCredential = {
  /** Credential ID as raw bytes. */
  credentialId: Uint8Array;
  /** Authenticator transports, which the platform reads as hints. */
  transports?: readonly PasskeyCredentialTransport[];
};

/** Ceremony parameters for asserting a passkey and evaluating its PRF. */
type WebAuthnGetCredentialRequest = {
  /** Relying party ID the assertion targets. */
  rpId: string;
  /** Challenge as raw bytes. */
  challenge: Uint8Array;
  /**
   * Credential the assertion is restricted to. When omitted, any discoverable
   * credential for `rpId` may answer.
   */
  allowCredential?: WebAuthnAllowCredential;
  /** PRF salt to evaluate, as 32 raw bytes. */
  prfSalt: Uint8Array;
  /** User-verification requirement. */
  userVerification: "required";
  /** Timeout in milliseconds. Platform defaults apply when omitted. */
  timeout?: number;
};

/** Outcome of one assertion ceremony. */
type WebAuthnGetCredentialResult = {
  /** Credential ID that answered, as raw bytes. */
  credentialId: Uint8Array;
  /** First PRF output for the requested salt. */
  prfOutput?: Uint8Array;
};

/**
 * Performs the two WebAuthn ceremonies mera needs, so runtimes without
 * `navigator.credentials` can supply their own. {@link browserWebAuthnClient}
 * is the default.
 *
 * @remarks
 * Every ceremony parameter comes from the request, including the
 * discoverable-credential, user-verification, and attestation requirements, so
 * an implementation forwards the request to the platform and reports what came
 * back without knowing any of mera's ceremony policy.
 *
 * Binary values cross in both directions as raw bytes. mera encodes the
 * credential IDs it hands its own callers as canonical unpadded base64url, so
 * that encoding holds by construction rather than by a check on the way back.
 *
 * A PRF output that is not 32 bytes fails with `PRF_UNAVAILABLE`.
 */
type WebAuthnClient = {
  createCredential(
    request: WebAuthnCreateCredentialRequest,
  ): Promise<WebAuthnCreateCredentialResult>;
  getCredential(
    request: WebAuthnGetCredentialRequest,
  ): Promise<WebAuthnGetCredentialResult>;
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
 * The {@link WebAuthnClient} backed by `navigator.credentials`.
 *
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable or returns an unexpected credential.
 * @throws MeraError with code `PRF_UNAVAILABLE` when a PRF result carries values that are not bytes.
 */
const browserWebAuthnClient: WebAuthnClient = {
  async createCredential(request) {
    assertCredentialApiAvailable();

    const credential = await navigator.credentials.create({
      publicKey: {
        rp: request.rp,
        user: {
          id: asBufferSource(request.user.id),
          name: request.user.name,
          displayName: request.user.displayName,
        },
        challenge: asBufferSource(request.challenge),
        pubKeyCredParams: request.algorithms.map((alg) => ({
          type: "public-key" as const,
          alg,
        })),
        ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
        attestation: request.attestation,
        authenticatorSelection: {
          residentKey: request.residentKey,
          // WebAuthn Level 1's boolean, kept in step with residentKey for
          // authenticators that still read it.
          requireResidentKey: true,
          userVerification: request.userVerification,
        },
        extensions: {
          prf: { eval: { first: asBufferSource(request.prfSalt) } },
        },
      },
    });

    const publicKeyCredential = assertPublicKeyCredential(credential);
    const prf = publicKeyCredential.getClientExtensionResults().prf;
    const response =
      publicKeyCredential.response as AuthenticatorAttestationResponse;
    const transports =
      typeof response.getTransports === "function"
        ? response.getTransports()
        : undefined;
    const first = prf?.results?.first;

    return {
      credentialId: new Uint8Array(publicKeyCredential.rawId),
      ...(transports !== undefined ? { transports } : {}),
      prfEnabled: prf?.enabled === true,
      ...(first ? { prfOutput: normalizePrfOutput(first) } : {}),
    };
  },

  async getCredential(request) {
    assertCredentialApiAvailable();

    const publicKey: PublicKeyCredentialRequestOptions = {
      rpId: request.rpId,
      challenge: asBufferSource(request.challenge),
      ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
      userVerification: request.userVerification,
      extensions: { prf: { eval: { first: asBufferSource(request.prfSalt) } } },
    };

    const { allowCredential } = request;

    if (allowCredential !== undefined) {
      publicKey.allowCredentials = [
        {
          id: asBufferSource(allowCredential.credentialId),
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

    return {
      credentialId: new Uint8Array(publicKeyCredential.rawId),
      ...(first ? { prfOutput: normalizePrfOutput(first) } : {}),
    };
  },
};

/**
 * Hands a request's bytes to WebAuthn, which takes `BufferSource`: a view over a
 * `SharedArrayBuffer` is not one. mera allocates every byte field in a request,
 * so none of them is one.
 */
function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as Uint8Array<ArrayBuffer>;
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
 * Reads a browser PRF result as bytes.
 *
 * Authenticators surface PRF output inconsistently: most return an `ArrayBuffer`,
 * some return an `ArrayBufferView`, and others (notably the 1Password browser
 * extension) return a plain array of byte values. The two typed forms become a
 * view over the browser's own buffer, which the caller copies.
 *
 * The typed forms are already constrained to bytes. A plain array-like is not,
 * so each element is validated as an integer in [0, 255] while it is read; a
 * bare `Uint8Array.from(value)` would instead silently coerce malformed values
 * (mod 256, `NaN` -> 0) into HKDF key material.
 *
 * @throws MeraError with code `PRF_UNAVAILABLE` when a plain array-like contains
 * a value that is not an integer in [0, 255].
 */
function normalizePrfOutput(
  value: BufferSource | ArrayLike<number>,
): Uint8Array {
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

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

export type { WebAuthnAllowCredential, WebAuthnClient };
export { browserWebAuthnClient };
