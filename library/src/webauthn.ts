import { copyPlatformPrfOutput } from "./encoding.js";
import { MeraError } from "./errors.js";
import type {
  PasskeyCredentialTransport,
  PasskeyRelyingParty,
} from "./types.js";

type WebAuthnClient = {
  readonly createCredential: (
    request: WebAuthnClient.CreateCredentialRequest,
  ) => Promise<WebAuthnClient.CreateCredentialResult>;
  readonly getCredential: (
    request: WebAuthnClient.GetCredentialRequest,
  ) => Promise<WebAuthnClient.GetCredentialResult>;
};

declare namespace WebAuthnClient {
  /** Ceremony parameters for creating one passkey and evaluating its PRF. */
  type CreateCredentialRequest = {
    /** Relying party identity for the new credential. */
    rp: PasskeyRelyingParty;
    /** User identity stored with the discoverable credential. */
    user: {
      id: Uint8Array<ArrayBuffer>;
      name: string;
      displayName: string;
    };
    challenge: Uint8Array<ArrayBuffer>;
    /** COSE algorithm identifiers for the credential key, most preferred first. */
    algorithms: readonly number[];
    /** PRF salt to evaluate during creation, as 32 raw bytes. */
    prfSalt: Uint8Array<ArrayBuffer>;
    /** Discoverable-credential requirement. */
    residentKey: "required";
    userVerification: "required";
    attestation: "none";
    /** Timeout in milliseconds. Platform defaults apply when omitted. */
    timeout?: number | undefined;
  };

  /** Outcome of one credential-creation ceremony. */
  type CreateCredentialResult = {
    /** Credential ID of the new passkey, as raw bytes. */
    credentialId: Uint8Array;
    /** Authenticator transports reported for the new credential. */
    transports?: readonly PasskeyCredentialTransport[] | undefined;
    /** Whether the authenticator enabled PRF for the new credential. */
    prfEnabled: boolean;
    /** First PRF output, when the authenticator evaluated the salt during creation. */
    prfOutput?: Uint8Array | undefined;
  };

  /** Credential an assertion is restricted to. */
  type AllowCredential = {
    credentialId: Uint8Array<ArrayBuffer>;
    /** Authenticator transports, which the platform reads as hints. */
    transports?: readonly PasskeyCredentialTransport[] | undefined;
  };

  /** Ceremony parameters for asserting a passkey and evaluating its PRF. */
  type GetCredentialRequest = {
    /** Relying party ID the assertion targets. */
    rpId: string;
    challenge: Uint8Array<ArrayBuffer>;
    /**
     * Credential the assertion is restricted to. When omitted, any discoverable
     * credential for `rpId` may answer.
     */
    allowCredential?: AllowCredential | undefined;
    /** PRF salt to evaluate, as 32 raw bytes. */
    prfSalt: Uint8Array<ArrayBuffer>;
    userVerification: "required";
    /** Timeout in milliseconds. Platform defaults apply when omitted. */
    timeout?: number | undefined;
    /**
     * Asks only for passkeys already on this device, and rejects without
     * showing UI when there is none. A client without such a mode runs a
     * normal assertion. Never set together with `allowCredential`.
     */
    immediate?: boolean | undefined;
  };

  /** Outcome of one assertion ceremony. */
  type GetCredentialResult = {
    /** Credential ID that answered, as raw bytes. */
    credentialId: Uint8Array;
    /** First PRF output for the requested salt. */
    prfOutput?: Uint8Array | undefined;
  };
}

/**
 * PRF extension outputs as browsers return them. lib.dom types the output as
 * a `BufferSource`, but the 1Password extension returns a plain array of byte
 * values.
 */
type PrfExtensionOutputs = {
  prf?: {
    enabled?: boolean;
    results?: { first?: BufferSource | ArrayLike<number> };
  };
};

/**
 * Assertion options with the Credential Management `uiMode` member, which
 * lib.dom does not type yet.
 */
type CredentialRequestOptionsWithUiMode = CredentialRequestOptions & {
  uiMode?: "immediate";
};

const browserWebAuthnClient: WebAuthnClient = {
  async createCredential(request) {
    const credential = await globalThis.navigator?.credentials?.create({
      publicKey: {
        rp: request.rp,
        user: request.user,
        challenge: request.challenge,
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
          prf: { eval: { first: request.prfSalt } },
        },
      },
    });

    const publicKeyCredential = assertPublicKeyCredential(credential);
    const prf = readPrfExtension(publicKeyCredential);
    const response =
      publicKeyCredential.response as AuthenticatorAttestationResponse;

    return {
      credentialId: new Uint8Array(publicKeyCredential.rawId),
      transports: response.getTransports?.(),
      prfEnabled: prf.enabled,
      prfOutput: prf.output,
    };
  },

  async getCredential(request) {
    const { allowCredential } = request;
    const options: CredentialRequestOptionsWithUiMode = {
      // A browser without immediate mode ignores the member and shows its
      // usual prompt.
      ...(request.immediate === true ? { uiMode: "immediate" } : {}),
      publicKey: {
        rpId: request.rpId,
        challenge: request.challenge,
        ...(request.timeout !== undefined ? { timeout: request.timeout } : {}),
        userVerification: request.userVerification,
        extensions: { prf: { eval: { first: request.prfSalt } } },
        ...(allowCredential !== undefined
          ? {
              allowCredentials: [
                {
                  id: allowCredential.credentialId,
                  type: "public-key" as const,
                  ...(allowCredential.transports !== undefined
                    ? {
                        // The library's transport type admits future strings
                        // beyond lib.dom's closed AuthenticatorTransport union.
                        // The cast is safe: transports are hints, and WebAuthn
                        // ignores values it does not recognize.
                        transports:
                          allowCredential.transports as AuthenticatorTransport[],
                      }
                    : {}),
                },
              ],
            }
          : {}),
      },
    };
    const credential = await globalThis.navigator?.credentials?.get(options);
    const publicKeyCredential = assertPublicKeyCredential(credential);
    const prf = readPrfExtension(publicKeyCredential);

    return {
      credentialId: new Uint8Array(publicKeyCredential.rawId),
      prfOutput: prf.output,
    };
  },
};

/**
 * The built-in clients. Each PRF output they return is a new buffer that only
 * the caller holds, so a passkey function that calls one zeroes it.
 */
const builtInWebAuthnClients: WeakSet<WebAuthnClient> = new WeakSet([
  browserWebAuthnClient,
]);

function assertPublicKeyCredential(
  credential: Credential | null | undefined,
): PublicKeyCredential {
  if (
    credential?.type !== "public-key" ||
    !("rawId" in credential) ||
    !("getClientExtensionResults" in credential) ||
    typeof credential.getClientExtensionResults !== "function"
  ) {
    throw new MeraError(
      "PASSKEY_OPERATION_FAILED",
      "WebAuthn returned no usable public key credential",
    );
  }

  return credential as PublicKeyCredential;
}

/**
 * @throws MeraError with code `PRF_UNAVAILABLE` when the PRF output is an
 * array holding a value that is not a byte.
 */
function readPrfExtension(credential: PublicKeyCredential): {
  enabled: boolean;
  output: Uint8Array | undefined;
} {
  const { prf }: PrfExtensionOutputs = credential.getClientExtensionResults();
  const first = prf?.results?.first;

  return {
    enabled: prf?.enabled === true,
    output: first ? copyPlatformPrfOutput(first) : undefined,
  };
}

export type { WebAuthnClient };
export { browserWebAuthnClient, builtInWebAuthnClients };
