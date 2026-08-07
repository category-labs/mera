import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { base64UrlDecode, base64UrlEncode, copyBytes } from "./encoding.js";
import { isMeraError, MeraError } from "./errors.js";
import type {
  CreatePasskeyWithPrfOutputResult,
  PasskeyCredentialMetadata,
  PasskeyCredentialTransport,
  PasskeyPrfResult,
  PasskeyRelyingParty,
} from "./types.js";
import {
  browserWebAuthnClient,
  type WebAuthnAllowCredential,
  type WebAuthnClient,
} from "./webauthn.js";
import { randomBytes } from "./webcrypto.js";

const DEFAULT_PRF_SALT = sha256(utf8ToBytes("mera.prf.salt.v1"));

// COSE algorithm identifiers for ES256 and RS256, the two key types every
// passkey provider supports.
const CREDENTIAL_ALGORITHMS = [-7, -257];

/** Inputs for creating a passkey and obtaining its first WebAuthn PRF output. */
type CreatePasskeyWithPrfOutputOptions = {
  /**
   * Relying party identity passed to WebAuthn. `id` is required so the
   * fallback assertion can target the same relying party.
   */
  rp: PasskeyRelyingParty;
  /** User identity passed to WebAuthn. */
  user: {
    /** User name displayed or stored by the authenticator. */
    name: string;
    /** Human-readable display name for the authenticator UI. */
    displayName: string;
  };
  /** WebAuthn timeout in milliseconds. Platform defaults apply when omitted. */
  timeout?: number;
  /**
   * 32-byte PRF salt evaluated during creation, or by the fallback assertion.
   * Defaults to the fixed salt documented on {@link getPasskeyPrfOutput}.
   */
  prfSalt?: Uint8Array;
  /**
   * Client that runs the WebAuthn ceremonies. Defaults to
   * {@link browserWebAuthnClient}, which calls `navigator.credentials`.
   */
  webAuthnClient?: WebAuthnClient;
};

/** Inputs for requesting the first WebAuthn PRF output from a passkey. */
type GetPasskeyPrfOutputOptions = {
  /** Relying party ID for the WebAuthn assertion. */
  rpId: string;
  /**
   * Credential metadata to restrict the assertion to one passkey. When
   * omitted, WebAuthn may choose any discoverable credential for the relying
   * party.
   */
  credential?: PasskeyCredentialMetadata;
  /**
   * PRF salt as 32 raw bytes. Defaults to the fixed salt documented on
   * {@link getPasskeyPrfOutput}.
   */
  prfSalt?: Uint8Array;
  /** WebAuthn timeout in milliseconds. Platform defaults apply when omitted. */
  timeout?: number;
  /**
   * Client that runs the WebAuthn ceremony. Defaults to
   * {@link browserWebAuthnClient}, which calls `navigator.credentials`.
   */
  webAuthnClient?: WebAuthnClient;
};

/**
 * Creates a discoverable, user-verified passkey that requires WebAuthn PRF
 * support and returns the first PRF output.
 *
 * @param options - Passkey creation inputs.
 * @returns Credential metadata and the first PRF output.
 * @remarks
 * Runs one creation ceremony and shows one user-verification prompt. On
 * authenticators that do not evaluate PRF during creation, a fallback
 * assertion evaluates the same salt and shows a second prompt.
 *
 * WebAuthn challenges and the credential's user handle (`user.id`) are
 * generated internally, 32 random bytes each. An authenticator overwrites a
 * discoverable credential that has the same `rp.id` and `user.id`, so a fresh
 * handle per call adds a passkey instead of replacing one.
 *
 * The credential is requested with fixed parameters: ES256 or RS256 key types,
 * attestation `"none"`, a required resident key, and required user
 * verification ({@link getPasskeyPrfOutput} explains the requirement).
 *
 * Any failure after the creation ceremony completes leaves the passkey on the
 * authenticator, but the thrown error does not carry its metadata.
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator reports no PRF support and returns no create-time output, returns an output that is not 32 bytes, or returns none on the fallback ceremony.
 * @throws MeraError with code `INPUT_INVALID` when an explicit `prfSalt` is not 32 bytes.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when `crypto.getRandomValues` is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function createPasskeyWithPrfOutput({
  rp,
  user,
  timeout,
  prfSalt,
  webAuthnClient = browserWebAuthnClient,
}: CreatePasskeyWithPrfOutputOptions): Promise<CreatePasskeyWithPrfOutputResult> {
  try {
    if (prfSalt !== undefined && prfSalt.length !== 32) {
      throw new MeraError("INPUT_INVALID", "PRF salt must be 32 bytes");
    }

    const prfSaltCopy = copyBytes(prfSalt ?? DEFAULT_PRF_SALT);

    const created = await webAuthnClient.createCredential({
      rp,
      user: {
        id: randomBytes(32),
        name: user.name,
        displayName: user.displayName,
      },
      challenge: randomBytes(32),
      algorithms: CREDENTIAL_ALGORITHMS,
      // The client gets its own salt array: prfSaltCopy is returned to the
      // caller and reused by the fallback assertion below.
      prfSalt: copyBytes(prfSaltCopy),
      residentKey: "required",
      userVerification: "required",
      attestation: "none",
      ...(timeout !== undefined ? { timeout } : {}),
    });

    // A create-time output settles the question on its own, so the flag only
    // decides whether a fallback assertion is worth a second prompt.
    if (created.prfOutput === undefined && !created.prfEnabled) {
      throw new MeraError(
        "PRF_UNAVAILABLE",
        "Authenticator did not enable PRF",
      );
    }

    const credentialMetadata = toCredentialMetadata(
      base64UrlEncode(created.credentialId),
      created.transports,
    );

    const prfOutput =
      created.prfOutput !== undefined
        ? copyPrfOutput(created.prfOutput)
        : (
            await getPasskeyPrfOutput({
              rpId: rp.id,
              credential: credentialMetadata,
              prfSalt: prfSaltCopy,
              webAuthnClient,
              ...(timeout !== undefined ? { timeout } : {}),
            })
          ).prfOutput;

    return {
      ...credentialMetadata,
      prfSalt: prfSaltCopy,
      prfOutput,
    };
  } catch (error) {
    if (isMeraError(error)) {
      throw error;
    }

    throw new MeraError("PASSKEY_OPERATION_FAILED", "Passkey creation failed", {
      cause: error,
    });
  }
}

/**
 * Requests a passkey PRF evaluation and returns the first output.
 *
 * @param options - Passkey PRF request inputs.
 * @returns The selected credential ID and first WebAuthn PRF output.
 * @remarks
 * Runs one assertion ceremony and shows one user-verification prompt.
 *
 * The WebAuthn challenge is generated internally.
 *
 * The default salt is `sha256("mera.prf.salt.v1")` and will not change across
 * library versions. The PRF output is a deterministic function of the
 * credential, `rpId`, and salt; a different salt yields an unrelated output.
 *
 * The assertion requires user verification, and the requirement is not
 * configurable. User verification is the authenticator's local check; the
 * gesture depends on the platform (a biometric, a device PIN, or a password).
 * Authenticators built on CTAP's `hmac-secret` keep two PRFs per credential,
 * one for user-verified requests and one for the rest; WebAuthn exposes only
 * the user-verified PRF and overrides a weaker `userVerification` setting
 * when evaluating it, so a configurable setting could neither change the PRF
 * output nor skip the check.
 * @see {@link https://www.w3.org/TR/webauthn-3/#prf-extension | WebAuthn: the PRF extension}
 * @see {@link https://www.w3.org/TR/webauthn-3/#enumdef-userverificationrequirement | WebAuthn: UserVerificationRequirement}
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not return a usable 32-byte PRF output.
 * @throws MeraError with code `INPUT_INVALID` when an explicit `prfSalt` is not 32 bytes, or `credential.credentialId` is empty or not canonical base64url.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when `crypto.getRandomValues` is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function getPasskeyPrfOutput({
  rpId,
  credential: allowCredential,
  prfSalt,
  timeout,
  webAuthnClient = browserWebAuthnClient,
}: GetPasskeyPrfOutputOptions): Promise<PasskeyPrfResult> {
  try {
    if (prfSalt !== undefined && prfSalt.length !== 32) {
      throw new MeraError("INPUT_INVALID", "PRF salt must be 32 bytes");
    }

    const asserted = await webAuthnClient.getCredential({
      rpId,
      challenge: randomBytes(32),
      // The client gets its own salt array, so it cannot reach DEFAULT_PRF_SALT.
      prfSalt: copyBytes(prfSalt ?? DEFAULT_PRF_SALT),
      userVerification: "required",
      ...(allowCredential !== undefined
        ? { allowCredential: toAllowCredential(allowCredential) }
        : {}),
      ...(timeout !== undefined ? { timeout } : {}),
    });

    if (asserted.prfOutput === undefined) {
      throw new MeraError(
        "PRF_UNAVAILABLE",
        "Authenticator did not return PRF output",
      );
    }

    return {
      credentialId: base64UrlEncode(asserted.credentialId),
      prfOutput: copyPrfOutput(asserted.prfOutput),
    };
  } catch (error) {
    if (isMeraError(error)) {
      throw error;
    }

    throw new MeraError(
      "PASSKEY_OPERATION_FAILED",
      "Passkey assertion failed",
      { cause: error },
    );
  }
}

/**
 * Builds credential metadata with a copied `transports` array.
 *
 * @internal
 */
function toCredentialMetadata(
  credentialId: string,
  transports: readonly PasskeyCredentialTransport[] | undefined,
): PasskeyCredentialMetadata {
  return {
    credentialId,
    ...(transports !== undefined ? { transports: [...transports] } : {}),
  };
}

/**
 * Turns a caller's credential metadata into the bytes a ceremony request
 * carries, decoding the canonical unpadded base64url mera stores and replays.
 *
 * WebAuthn floors only randomly generated credential IDs at 16 bytes; the
 * encrypted-credential-source form has no stated minimum, so only emptiness is
 * rejected: an empty ID must not silently widen an assertion to any
 * discoverable passkey. A short-but-nonempty ID fails closed at the
 * authenticator as a non-matching allowCredentials entry.
 *
 * @see {@link https://www.w3.org/TR/webauthn-3/#credential-id | WebAuthn: credential ID}
 * @throws MeraError with code `INPUT_INVALID` when the ID is empty or not
 * canonical unpadded base64url.
 */
function toAllowCredential(
  credential: PasskeyCredentialMetadata,
): WebAuthnAllowCredential {
  return {
    credentialId: base64UrlDecode(credential.credentialId, {
      name: "credential.credentialId",
      minByteLength: 1,
    }),
    ...(credential.transports !== undefined
      ? { transports: [...credential.transports] }
      : {}),
  };
}

/**
 * Copies a {@link WebAuthnClient} PRF output into an array mera owns, so a
 * client that hands back a live buffer cannot change what the caller keeps.
 *
 * @throws MeraError with code `PRF_UNAVAILABLE` when the output is not exactly
 * 32 bytes.
 */
function copyPrfOutput(prfOutput: Uint8Array): Uint8Array<ArrayBuffer> {
  if (prfOutput.length !== 32) {
    throw new MeraError("PRF_UNAVAILABLE", "PRF output must be 32 bytes");
  }

  return copyBytes(prfOutput);
}

export type { CreatePasskeyWithPrfOutputOptions, GetPasskeyPrfOutputOptions };
export {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  toCredentialMetadata,
};
