/**
 * Stable error codes thrown by this package.
 *
 * - `PASSKEY_OPERATION_FAILED`: WebAuthn failed, was cancelled, returned an unexpected credential, or the credential API is unavailable.
 * - `CRYPTO_UNAVAILABLE`: the runtime lacks a needed Web Crypto primitive. The passkey and signing APIs need `crypto.getRandomValues`; the secret-vault APIs also need `crypto.subtle`.
 * - `PRF_UNAVAILABLE`: the authenticator did not enable or return a usable 32-byte WebAuthn PRF output.
 * - `SESSION_ENDED`: a signing call was made after `end()`.
 * - `DECRYPT_FAILED`: AES-GCM authentication failed (wrong key or tampered nonce/ciphertext).
 * - `INPUT_INVALID`: a caller-supplied value at a public boundary did not satisfy a length, range, encoding, or curve (scalar or point) constraint.
 * - `VAULT_FORMAT_INVALID`: untrusted vault data (JSON or object) was malformed, missing required fields, used a non-canonical encoding, or declared an unsupported version.
 */
type MeraErrorCode =
  | "PASSKEY_OPERATION_FAILED"
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

  constructor(
    code: MeraErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "MeraError";
    this.code = code;
  }
}

/** Returns `true` when `error` is a `MeraError`. */
function isMeraError(error: unknown): error is MeraError {
  return error instanceof MeraError;
}

export type { MeraErrorCode };
export { isMeraError, MeraError };
