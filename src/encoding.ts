import { base64urlnopad } from "@scure/base";
import { MeraError } from "./errors.js";

/**
 * Copies bytes into a standalone `Uint8Array`.
 *
 * The returned array never aliases the input.
 *
 * @param value - Bytes to copy.
 * @returns A new `Uint8Array` with the same bytes as `value`.
 */
function copyBytes(value: Uint8Array): Uint8Array {
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
 * @param options - Optional constraints on the decoded bytes.
 * @param options.minByteLength - Minimum decoded length in bytes.
 * @returns Decoded bytes.
 * @throws MeraError with code `INPUT_INVALID` when `value` uses invalid characters, invalid length, or non-canonical padding, or decodes to fewer than `options.minByteLength` bytes.
 */
function base64UrlDecode(
  value: string,
  options: { minByteLength?: number } = {},
): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = base64urlnopad.decode(value);
  } catch (cause) {
    throw new MeraError("INPUT_INVALID", "value must be base64url", {
      cause,
    });
  }

  if (
    options.minByteLength !== undefined &&
    bytes.length < options.minByteLength
  ) {
    throw new MeraError(
      "INPUT_INVALID",
      `value must be at least ${options.minByteLength} bytes`,
    );
  }

  return bytes;
}

export { asArrayBuffer, base64UrlDecode, base64UrlEncode, copyBytes };
