import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

const DETERMINISTIC_PRF_SALT = sha256(utf8ToBytes("mera.v1.deterministic.prf"));

/**
 * Returns Mera's fixed v1 deterministic PRF salt: `sha256("mera.v1.deterministic.prf")`.
 *
 * The salt is a constant and will not change across library versions, so one
 * passkey assertion against it produces one stable 32-byte PRF output per
 * credential and relying party. The salt encodes no account selection; that
 * happens in the derivation scheme the app applies to the PRF output.
 *
 * @returns A fresh 32-byte copy of the fixed salt: a `Uint8Array` cannot be
 * frozen, so a shared buffer mutated by one caller would silently change every
 * later derivation.
 */
function getDeterministicPrfSaltV1(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(DETERMINISTIC_PRF_SALT);
}

export { getDeterministicPrfSaltV1 };
