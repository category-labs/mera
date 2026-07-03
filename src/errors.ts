/**
 * Stable coarse-grained error codes thrown by this package.
 *
 * - `PASSKEY_OPERATION_FAILED`: WebAuthn failed, was cancelled, or returned an unexpected credential, or a required browser API (the credential API, Web Crypto) is unavailable.
 * - `PRF_UNAVAILABLE`: the authenticator did not enable or return a usable 32-byte WebAuthn PRF output.
 * - `SESSION_LOCKED`: a signing call was made after `lock()`.
 * - `DECRYPT_FAILED`: AES-GCM authentication failed (wrong key, or tampered ciphertext or additional authenticated data).
 * - `INPUT_INVALID`: a caller-supplied value at a public boundary did not satisfy a length, range, encoding, or scalar constraint.
 * - `VAULT_FORMAT_INVALID`: untrusted vault data (JSON or object) was malformed, missing required fields, or used a non-canonical encoding.
 */
type MeraErrorCode =
  | "PASSKEY_OPERATION_FAILED"
  | "PRF_UNAVAILABLE"
  | "SESSION_LOCKED"
  | "DECRYPT_FAILED"
  | "INPUT_INVALID"
  | "VAULT_FORMAT_INVALID";

/** Error thrown by this package. `code` is the stable machine-readable category. */
class MeraError extends Error {
  /** Machine-readable category for the failure. */
  readonly code: MeraErrorCode;

  /** Creates an error with a stable `code` and a human-readable `message`. `options.cause` carries the original failure, when available. */
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

/** Returns true when `error` is a `MeraError`. */
function isMeraError(error: unknown): error is MeraError {
  return error instanceof MeraError;
}

export type { MeraErrorCode };
export { isMeraError, MeraError };
