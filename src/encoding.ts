import { base64urlnopad } from "@scure/base";
import { MeraError, type MeraErrorCode } from "./errors.js";

/**
 * Copies bytes into a standalone `Uint8Array`.
 *
 * @internal
 */
function copyBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(value);
}

/**
 * Encodes bytes as canonical unpadded base64url.
 *
 * @internal
 */
function base64UrlEncode(value: Uint8Array): string {
  return base64urlnopad.encode(value);
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

export { base64UrlDecode, base64UrlEncode, copyBytes };
