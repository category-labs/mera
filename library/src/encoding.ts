import { base64urlnopad } from "@scure/base";
import { MeraError, type MeraErrorCode } from "./errors.js";

function normalizePrfOutput(
  value: ArrayBuffer | ArrayBufferView | ArrayLike<number>,
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

/**
 * Decodes canonical unpadded base64url into bytes.
 *
 * @param value - Canonical unpadded base64url text.
 * @param options - Optional constraints on the decoded bytes and error reporting.
 * @param options.name - Value name used in error messages. Defaults to `"value"`.
 * @param options.code - Error code thrown on failure. Defaults to `"INPUT_INVALID"`.
 * @param options.byteLength - Exact decoded length in bytes.
 * @param options.minByteLength - Minimum decoded length in bytes.
 * @returns Decoded bytes.
 * @throws MeraError with `options.code` when `value` uses invalid characters, invalid length, or non-canonical padding, or the decoded bytes violate `options.byteLength` or `options.minByteLength`.
 * @internal
 */
function base64UrlDecode(
  value: string,
  options: {
    name?: string;
    code?: MeraErrorCode;
    byteLength?: number;
    minByteLength?: number;
  } = {},
): Uint8Array<ArrayBuffer> {
  const { name = "value", code = "INPUT_INVALID" } = options;

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64urlnopad.decode(value) as Uint8Array<ArrayBuffer>;
  } catch (cause) {
    throw new MeraError(code, `${name} must be base64url`, { cause });
  }

  if (options.byteLength !== undefined && bytes.length !== options.byteLength) {
    throw new MeraError(code, `${name} must be ${options.byteLength} bytes`);
  }

  if (
    options.minByteLength !== undefined &&
    bytes.length < options.minByteLength
  ) {
    throw new MeraError(
      code,
      `${name} must be at least ${options.minByteLength} bytes`,
    );
  }

  return bytes;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

export { base64UrlDecode, isStringArray, normalizePrfOutput };
