import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
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
 * @returns Decoded bytes.
 * @throws MeraError with code `INPUT_INVALID` when `value` uses invalid characters, invalid length, or non-canonical padding.
 */
function base64UrlDecode(value: string): Uint8Array {
  try {
    return base64urlnopad.decode(value);
  } catch (cause) {
    throw new MeraError("INPUT_INVALID", "value must be base64url", {
      cause,
    });
  }
}

/**
 * Encodes a non-negative uint32 using big-endian byte order.
 *
 * @param value - Integer to encode.
 * @returns Four big-endian bytes.
 * @remarks Caller assumptions: `value` is already a uint32 integer.
 */
function uint32Be(value: number): Uint8Array {
  const output = new Uint8Array(4);
  const view = new DataView(output.buffer);
  view.setUint32(0, value, false);
  return output;
}

/**
 * Canonically encodes byte values using uint32 big-endian length prefixes.
 *
 * @param parts - Byte arrays to encode in order.
 * @returns A new byte array containing each part with a four-byte length prefix.
 */
function canonicalEncode(parts: Uint8Array[]): Uint8Array {
  return concatBytes(...parts.flatMap((part) => [uint32Be(part.length), part]));
}

export {
  asArrayBuffer,
  base64UrlDecode,
  base64UrlEncode,
  canonicalEncode,
  concatBytes,
  copyBytes,
  uint32Be,
  utf8ToBytes,
};
