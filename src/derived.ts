import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "./encoding.js";

const DETERMINISTIC_PRF_DOMAIN = utf8ToBytes("mera.v1.deterministic.prf");
// The domain is a compile-time constant, so the salt is constant too: compute
// the hash once at module load and hand out a fresh copy per call.
const DETERMINISTIC_PRF_SALT = sha256(DETERMINISTIC_PRF_DOMAIN);

/**
 * Computes Mera's fixed v1 deterministic PRF salt.
 *
 * One passkey assertion against this salt produces one stable 32-byte PRF
 * output for the selected credential and relying party. Apps then derive wallet
 * keys from that output using their chosen scheme, such as BIP-39/BIP-32 or
 * SLIP-0010.
 *
 * @returns Mera's fixed v1 deterministic 32-byte PRF salt.
 * @remarks Caller assumptions: wallet account selection belongs in the caller's wallet derivation scheme, not in this salt.
 */
function createDeterministicPrfSalt(): Uint8Array {
  return new Uint8Array(DETERMINISTIC_PRF_SALT);
}

export { createDeterministicPrfSalt };
