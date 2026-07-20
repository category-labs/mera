import { base64urlnopad } from "@scure/base";
import { MeraError, type MeraErrorCode } from "./errors.js";

/**
 * Copies bytes into a standalone `Uint8Array`.
 * @param value - Bytes to copy.
 * @returns A new `Uint8Array` with the same bytes as `value`.
 */
function copyBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(value);
}

/**
 * Copies bytes into a standalone `ArrayBuffer` for Web APIs.
 *
 * @param value - Bytes to copy.
 * @returns A new `ArrayBuffer` with the same bytes as `value`.
 */
function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(value.byteLength);
  new Uint8Array(output).set(value);
  return output;
}

/**
 * Encodes bytes as canonical unpadded base64url.
 *
 * @param value - Bytes to encode.
 * @returns Canonical unpadded base64url text.
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
 */
function base64UrlDecode(
  value: string,
  options: {
    name?: string;
    code?: MeraErrorCode;
    byteLength?: number;
    minByteLength?: number;
  } = {},
): Uint8Array {
  const { name = "value", code = "INPUT_INVALID" } = options;

  let bytes: Uint8Array;
  try {
    bytes = base64urlnopad.decode(value);
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

export { asArrayBuffer, base64UrlDecode, base64UrlEncode, copyBytes };
