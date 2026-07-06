/**
 * Stable coarse-grained error codes thrown by this package.
 *
 * - `PASSKEY_OPERATION_FAILED`: WebAuthn failed, was cancelled, returned an unexpected credential, or the credential API is unavailable.
 * - `CRYPTO_UNAVAILABLE`: Web Crypto is unavailable.
 * - `PRF_UNAVAILABLE`: the authenticator did not enable or return a usable 32-byte WebAuthn PRF output.
 * - `SESSION_LOCKED`: a signing call was made after `lock()`.
 * - `DECRYPT_FAILED`: AES-GCM authentication failed (wrong key, or tampered ciphertext or additional authenticated data).
 * - `INPUT_INVALID`: a caller-supplied value at a public boundary did not satisfy a length, range, encoding, or scalar constraint.
 * - `VAULT_FORMAT_INVALID`: untrusted vault data (JSON or object) was malformed, missing required fields, used a non-canonical encoding, or declared an unsupported version.
 */
type MeraErrorCode =
  | "PASSKEY_OPERATION_FAILED"
  | "CRYPTO_UNAVAILABLE"
  | "PRF_UNAVAILABLE"
  | "SESSION_LOCKED"
  | "DECRYPT_FAILED"
  | "INPUT_INVALID"
  | "VAULT_FORMAT_INVALID";

/** Error thrown by this package. `code` is the stable machine-readable category. */
class MeraError extends Error {
  /** Machine-readable category for the failure. */
  readonly code: MeraErrorCode;

  /**
   * Creates a package error with a stable error code.
   *
   * @param code - Machine-readable category for the failure.
   * @param message - Human-readable error message.
   * @param options - Optional error construction options.
   * @param options.cause - Original cause for this error, when available.
   */
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

/**
 * Returns true when an unknown error is a `MeraError`.
 *
 * @param error - Value to check.
 * @returns `true` when `error` is a `MeraError`.
 */
function isMeraError(error: unknown): error is MeraError {
  return error instanceof MeraError;
}

export type { MeraErrorCode };
export { isMeraError, MeraError };
