import type { PasskeyCredentialMetadata } from "./types.js";

/**
 * Stable error codes thrown by this package.
 *
 * - `PASSKEY_OPERATION_FAILED`: WebAuthn failed, returned an unexpected credential, or the credential API is unavailable.
 * - `PASSKEY_CANCELLED`: the person dismissed the passkey prompt, it timed out, or no passkey answered.
 * - `PASSKEY_EXISTS`: the authenticator already holds a passkey listed in `excludeCredentials`.
 * - `CRYPTO_UNAVAILABLE`: the runtime lacks a needed Web Crypto primitive. The passkey APIs need `crypto.getRandomValues`; the secret-vault APIs also need `crypto.subtle`.
 * - `PRF_UNAVAILABLE`: the authenticator did not enable or return a usable 32-byte WebAuthn PRF output.
 * - `SESSION_ENDED`: a signing call was made after `end()`.
 * - `DECRYPT_FAILED`: AES-GCM authentication failed (wrong key or tampered nonce/ciphertext).
 * - `INPUT_INVALID`: a caller-supplied value at a public boundary did not satisfy a length, range, encoding, or curve (scalar or point) constraint.
 * - `VAULT_FORMAT_INVALID`: untrusted vault data (JSON or object) was malformed, missing required fields, used a non-canonical encoding, or declared an unsupported version.
 */
type MeraErrorCode =
  | "PASSKEY_OPERATION_FAILED"
  | "PASSKEY_CANCELLED"
  | "PASSKEY_EXISTS"
  | "CRYPTO_UNAVAILABLE"
  | "PRF_UNAVAILABLE"
  | "SESSION_ENDED"
  | "DECRYPT_FAILED"
  | "INPUT_INVALID"
  | "VAULT_FORMAT_INVALID";

/** Error thrown by this package. */
class MeraError extends Error {
  /** Stable machine-readable category for the failure. */
  readonly code: MeraErrorCode;
  // Declared without a class field, so other errors have no such property.
  /**
   * The passkey a creation ceremony left on the authenticator. Present only
   * when `createPasskeyWithPrfOutput` or `createSecretVaultWithNewPasskey`
   * fails after its creation ceremony completed.
   */
  declare readonly credential?: PasskeyCredentialMetadata | undefined;

  constructor(
    code: MeraErrorCode,
    message: string,
    options?: ErrorOptions & {
      /** Value for {@link MeraError.credential}. */
      credential?: PasskeyCredentialMetadata | undefined;
    },
  ) {
    super(message, options);
    this.name = "MeraError";
    this.code = code;
    if (options?.credential !== undefined) {
      this.credential = options.credential;
    }
  }
}

/**
 * Keeps a `MeraError` as is and wraps any other failure, such as a WebAuthn
 * rejection, as `PASSKEY_OPERATION_FAILED`.
 */
function toPasskeyError(error: unknown, message: string): MeraError {
  return error instanceof MeraError
    ? error
    : new MeraError("PASSKEY_OPERATION_FAILED", message, { cause: error });
}

/**
 * Copies a failure that followed a completed creation ceremony, adding the
 * passkey the authenticator now holds. The original stays as is, because a
 * client may reject every call with one shared error. Only `credentialId` and
 * `transports` are read, because a creation result also holds the PRF output.
 */
function withCreatedCredential(
  error: MeraError,
  { credentialId, transports }: PasskeyCredentialMetadata,
): MeraError {
  return new MeraError(error.code, error.message, {
    ...(error.cause !== undefined ? { cause: error.cause } : {}),
    credential: {
      credentialId,
      ...(transports !== undefined ? { transports: [...transports] } : {}),
    },
  });
}

export type { MeraErrorCode };
export { MeraError, toPasskeyError, withCreatedCredential };
