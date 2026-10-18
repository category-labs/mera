import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { base64urlnopad } from "@scure/base";
import { base64UrlDecode, copyBytes } from "./encoding.js";
import { MeraError, NewPasskeyError } from "./errors.js";
import type {
  PasskeyCredentialMetadata,
  PasskeyCredentialTransport,
  PasskeyRelyingParty,
} from "./types.js";
import { browserWebAuthnClient, type WebAuthnClient } from "./webauthn.js";
import { randomBytes } from "./webcrypto.js";

const DEFAULT_PRF_SALT = sha256(utf8ToBytes("mera.prf.salt.v1"));

const PASSKEY_COSE_ALGORITHMS = [-7, -257];

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
 * Any failure after the WebAuthn client returns the new passkey leaves it on
 * the authenticator and throws a {@link NewPasskeyError} that names it. A
 * `NewPasskeyError` with code `PASSKEY_OPERATION_FAILED` comes from the
 * fallback assertion, which runs only on a passkey that reported PRF support.
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
}: createPasskeyWithPrfOutput.Options): Promise<createPasskeyWithPrfOutput.Result> {
  let credential: PasskeyCredentialMetadata | undefined;

  try {
    const prfSaltCopy = copyPrfSalt(prfSalt);
    const created = await webAuthnClient.createCredential({
      rp,
      user: {
        id: randomBytes(32),
        name: user.name,
        displayName: user.displayName,
      },
      challenge: randomBytes(32),
      algorithms: PASSKEY_COSE_ALGORITHMS,
      prfSalt: prfSaltCopy,
      residentKey: "required",
      userVerification: "required",
      attestation: "none",
      timeout,
    });
    credential = toCredentialMetadata(
      base64urlnopad.encode(created.credentialId),
      created.transports,
    );

    if (created.prfOutput === undefined && !created.prfEnabled) {
      throw new MeraError(
        "PRF_UNAVAILABLE",
        "Authenticator did not enable PRF",
      );
    }

    const prfOutput =
      created.prfOutput !== undefined
        ? copyPrfOutput(created.prfOutput)
        : (
            await getPasskeyPrfOutput({
              rpId: rp.id,
              credential,
              prfSalt: prfSaltCopy,
              webAuthnClient,
              timeout,
            })
          ).prfOutput;

    return {
      ...credential,
      prfSalt: prfSaltCopy,
      prfOutput,
    };
  } catch (error) {
    const passkeyError = toPasskeyError(error, "Passkey creation failed");
    throw credential === undefined
      ? passkeyError
      : new NewPasskeyError(passkeyError, credential);
  }
}

declare namespace createPasskeyWithPrfOutput {
  /** Inputs for creating a passkey and obtaining its first WebAuthn PRF output. */
  type Options = {
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
    timeout?: number | undefined;
    /**
     * 32-byte PRF salt evaluated during creation, or by the fallback assertion.
     * Defaults to the fixed salt documented on {@link getPasskeyPrfOutput}.
     */
    prfSalt?: Uint8Array | undefined;
    /**
     * Client that runs the WebAuthn ceremonies. Defaults to the built-in browser
     * client, which calls `navigator.credentials`.
     */
    webAuthnClient?: WebAuthnClient | undefined;
  };

  /** Result of creating a passkey together with its first PRF output. */
  type Result = PasskeyCredentialMetadata & {
    /**
     * PRF salt that WebAuthn evaluated. Always 32 bytes, in a fresh allocation.
     */
    readonly prfSalt: Uint8Array<ArrayBuffer>;
    /** First WebAuthn PRF output for `prfSalt`. Always 32 bytes. */
    readonly prfOutput: Uint8Array<ArrayBuffer>;
  };
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
}: getPasskeyPrfOutput.Options): Promise<getPasskeyPrfOutput.Result> {
  try {
    const prfSaltCopy = copyPrfSalt(prfSalt);
    const asserted = await webAuthnClient.getCredential({
      rpId,
      challenge: randomBytes(32),
      prfSalt: prfSaltCopy,
      userVerification: "required",
      allowCredential: allowCredential && toAllowCredential(allowCredential),
      timeout,
    });

    if (asserted.prfOutput === undefined) {
      throw new MeraError(
        "PRF_UNAVAILABLE",
        "Authenticator did not return PRF output",
      );
    }

    return {
      credentialId: base64urlnopad.encode(asserted.credentialId),
      prfOutput: copyPrfOutput(asserted.prfOutput),
    };
  } catch (error) {
    throw toPasskeyError(error, "Passkey assertion failed");
  }
}

declare namespace getPasskeyPrfOutput {
  /** Inputs for requesting the first WebAuthn PRF output from a passkey. */
  type Options = {
    /** Relying party ID for the WebAuthn assertion. */
    rpId: string;
    /**
     * Credential metadata to restrict the assertion to one passkey. When
     * omitted, WebAuthn may choose any discoverable credential for the relying
     * party.
     */
    credential?: PasskeyCredentialMetadata | undefined;
    /**
     * PRF salt as 32 raw bytes. Defaults to the fixed salt documented on
     * {@link getPasskeyPrfOutput}.
     */
    prfSalt?: Uint8Array | undefined;
    /** WebAuthn timeout in milliseconds. Platform defaults apply when omitted. */
    timeout?: number | undefined;
    /**
     * Client that runs the WebAuthn ceremony. Defaults to the built-in browser
     * client, which calls `navigator.credentials`.
     */
    webAuthnClient?: WebAuthnClient | undefined;
  };

  /** Result of a passkey assertion with the WebAuthn PRF extension. */
  type Result = {
    /** Credential ID selected by the platform, as canonical unpadded base64url. */
    readonly credentialId: string;
    /** First PRF output from WebAuthn. Always 32 bytes. */
    readonly prfOutput: Uint8Array<ArrayBuffer>;
  };
}

// Leaves out absent transports, so returned metadata and vaults hold no
// undefined field.
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
 * Decodes the stored credential ID and rejects an empty ID, which would
 * otherwise allow any passkey.
 *
 * @throws MeraError with code `INPUT_INVALID` when the ID is empty or not
 * canonical unpadded base64url.
 */
function toAllowCredential(
  credential: PasskeyCredentialMetadata,
): WebAuthnClient.AllowCredential {
  return {
    credentialId: base64UrlDecode(credential.credentialId, {
      name: "credential.credentialId",
      minByteLength: 1,
    }),
    transports: credential.transports?.slice(),
  };
}

/**
 * Copies even the default salt, so neither a client nor a caller that writes
 * to the returned salt can change `DEFAULT_PRF_SALT`.
 */
function copyPrfSalt(
  prfSalt: Uint8Array = DEFAULT_PRF_SALT,
): Uint8Array<ArrayBuffer> {
  if (prfSalt.length !== 32) {
    throw new MeraError("INPUT_INVALID", "PRF salt must be 32 bytes");
  }

  return copyBytes(prfSalt);
}

function copyPrfOutput(prfOutput: Uint8Array): Uint8Array<ArrayBuffer> {
  if (prfOutput.length !== 32) {
    throw new MeraError("PRF_UNAVAILABLE", "PRF output must be 32 bytes");
  }

  return copyBytes(prfOutput);
}

/**
 * Keeps a `MeraError` as is and wraps any other failure, such as a WebAuthn
 * rejection, as `PASSKEY_OPERATION_FAILED`.
 */
function toPasskeyError(error: unknown, message: string): MeraError {
  return error instanceof MeraError
    ? error
    : new MeraError("PASSKEY_OPERATION_FAILED", message, { cause: error });
}

export {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  toCredentialMetadata,
};
