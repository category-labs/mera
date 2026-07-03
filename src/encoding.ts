import { base64urlnopad } from "@scure/base";
import { MeraError } from "./errors.js";

/** Copies bytes into a new `Uint8Array` that never aliases the input. */
function copyBytes(value: Uint8Array): Uint8Array {
  return new Uint8Array(value);
}

/** Copies bytes into a new `ArrayBuffer` for Web API arguments. */
function asArrayBuffer(value: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(value.byteLength);
  new Uint8Array(output).set(value);
  return output;
}

/** Encodes bytes as canonical unpadded base64url. */
function base64UrlEncode(value: Uint8Array): string {
  return base64urlnopad.encode(value);
}

/**
 * Decodes canonical unpadded base64url into bytes.
 *
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

export { asArrayBuffer, base64UrlDecode, base64UrlEncode, copyBytes };
