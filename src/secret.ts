import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  asArrayBuffer,
  base64UrlDecode,
  base64UrlEncode,
  copyBytes,
} from "./encoding.js";
import { MeraError, type MeraErrorCode } from "./errors.js";
import { getPasskeyPrfOutput } from "./passkey.js";
import type {
  PasskeyCredentialTransport,
  PasskeyPrfResult,
  PasskeySecretVault,
} from "./types.js";
import { getCrypto, hkdfSha256AesGcmKey, randomBytes } from "./webcrypto.js";

const PRF_SALT_LENGTH = 32;
const PRF_OUTPUT_LENGTH = 32;
const NONCE_LENGTH = 12;
// AES-256-GCM authentication tag length in bytes (WebCrypto's 128-bit default,
// since aesGcmEncrypt does not set tagLength). Ciphertext carries its tag, so
// any authentic ciphertext is at least this long.
const GCM_TAG_LENGTH = 16;

/**
 * Encodes a non-negative uint32 using big-endian byte order.
 *
 * @param value - Integer to encode.
 * @returns Four big-endian bytes.
 * @remarks `value` is not range-checked; `DataView.setUint32` applies the
 * uint32 conversion, so out-of-range input wraps.
 */
function uint32Be(value: number): Uint8Array {
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, value, false);
  return output;
}

/**
 * Canonically encodes byte values using uint32 big-endian length prefixes.
 *
 * The length prefixes make the concatenation unambiguous.
 *
 * @param parts - Byte arrays to encode in order.
 * @returns A new byte array containing each part with a four-byte length prefix.
 */
function canonicalEncode(parts: readonly Uint8Array[]): Uint8Array {
  return concatBytes(...parts.flatMap((part) => [uint32Be(part.length), part]));
}

// HKDF info and AAD for the secret vault. The HKDF info keeps the wrapping key
// distinct from any other key derived from the same PRF output. The AAD is a
// precomputed constant (domain ‖ version): a secret vault has no public key to
// bind.
const SECRET_WRAP_INFO = utf8ToBytes("mera.v1.wrap.secret");
const SECRET_AAD_DOMAIN = utf8ToBytes("mera.v1.secret.aad");
const SECRET_AAD_VERSION = 1;
const SECRET_AAD = canonicalEncode([
  SECRET_AAD_DOMAIN,
  uint32Be(SECRET_AAD_VERSION),
]);

/** AES-GCM encrypted bytes. */
type EncryptedBytes = {
  /** AES-GCM nonce. Secret vaults require 12 bytes. */
  nonce: Uint8Array;
  /** AES-GCM ciphertext including the authentication tag. */
  ciphertext: Uint8Array;
};

// Derives the vault wrapping key. The 32-byte check validates caller-supplied
// PRF output at the public boundary before it becomes key material.
async function deriveWrappingKey(prfOutput: Uint8Array): Promise<CryptoKey> {
  if (prfOutput.length !== PRF_OUTPUT_LENGTH) {
    throw new MeraError("INPUT_INVALID", "PRF output must be 32 bytes");
  }

  return hkdfSha256AesGcmKey(prfOutput, SECRET_WRAP_INFO);
}

// AES-256-GCM encrypt. subtle.encrypt copies its inputs synchronously and the
// caller owns the plaintext, so this helper has nothing of its own to zero.
// GCM nonces are generated internally so callers cannot accidentally reuse one.
async function aesGcmEncrypt({
  plaintext,
  wrappingKey,
  aad,
}: {
  plaintext: Uint8Array;
  wrappingKey: CryptoKey;
  aad: Uint8Array;
}): Promise<EncryptedBytes> {
  const iv = randomBytes(NONCE_LENGTH);

  const ciphertext = await getCrypto().subtle.encrypt(
    {
      name: "AES-GCM",
      iv: asArrayBuffer(iv),
      additionalData: asArrayBuffer(aad),
    },
    wrappingKey,
    asArrayBuffer(plaintext),
  );

  return {
    nonce: iv,
    ciphertext: new Uint8Array(ciphertext),
  };
}

// AES-256-GCM decrypt. Authentication failures (wrong key, tampered ciphertext
// or AAD) surface as DECRYPT_FAILED. The returned bytes are not interpreted.
async function aesGcmDecrypt({
  encrypted,
  wrappingKey,
  aad,
}: {
  encrypted: EncryptedBytes;
  wrappingKey: CryptoKey;
  aad: Uint8Array;
}): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const plaintext = await getCrypto().subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asArrayBuffer(encrypted.nonce),
        additionalData: asArrayBuffer(aad),
      },
      wrappingKey,
      asArrayBuffer(encrypted.ciphertext),
    );
    return new Uint8Array(plaintext);
  } catch (error) {
    throw new MeraError("DECRYPT_FAILED", "Unable to decrypt ciphertext", {
      cause: error,
    });
  }
}

function parseJsonVault(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new MeraError("VAULT_FORMAT_INVALID", "Vault JSON is invalid", {
      cause: error,
    });
  }
}

function readBase64Url(
  value: unknown,
  name: string,
  errorCode: MeraErrorCode,
  byteLength?: number | { min: number },
): string {
  if (typeof value !== "string") {
    throw new MeraError(errorCode, `${name} must be base64url`);
  }

  let bytes: Uint8Array;
  try {
    bytes = base64UrlDecode(value);
  } catch (cause) {
    throw new MeraError(errorCode, `${name} must be base64url`, { cause });
  }

  if (typeof byteLength === "number" && bytes.length !== byteLength) {
    throw new MeraError(errorCode, `${name} must be ${byteLength} bytes`);
  }

  if (typeof byteLength === "object" && bytes.length < byteLength.min) {
    throw new MeraError(
      errorCode,
      `${name} must be at least ${byteLength.min} bytes`,
    );
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Inputs for encrypting one arbitrary secret into a vault. */
type CreateSecretVaultInput = {
  /**
   * Passkey credential plus the PRF salt and PRF output it produced. The result
   * of `createPasskeyWithPrfOutput` can be passed straight through.
   */
  credential: {
    /** Passkey credential ID as canonical unpadded base64url. */
    credentialId: string;
    /** Authenticator transports reported by the browser, when available. */
    transports?: readonly PasskeyCredentialTransport[];
    /** PRF salt for this secret. Must be exactly 32 bytes. */
    prfSalt: Uint8Array;
    /** First WebAuthn PRF output for `prfSalt`. Must be exactly 32 bytes. */
    prfOutput: Uint8Array;
  };
  /** Secret bytes to encrypt. Any non-empty length; the library does not interpret them. */
  secret: Uint8Array;
};

/**
 * Encrypts an arbitrary secret into a passkey-protected vault.
 *
 * An AES-256-GCM wrapping key is derived from the PRF output with
 * secret-specific HKDF info, and the secret is encrypted under fixed
 * additional authenticated data (AAD).
 *
 * @remarks
 * The input byte buffers are copied before async cryptographic work starts;
 * post-call mutation does not change the vault being produced. Caller-owned
 * input buffers are not modified or zeroed.
 *
 * Security: a vault is bound to its `prfOutput` only — not to the credential
 * ID, salt, or nonce. Secrets wrapped under one reused PRF output share a
 * wrapping key, so their ciphertexts are interchangeable by anyone who can
 * rewrite stored vault JSON; a fresh `prfSalt` per secret avoids the shared key.
 * @param options - Credential material and the secret to wrap; fields are documented on {@link CreateSecretVaultOptions}.
 * @returns A JSON-safe secret vault.
 * @throws MeraError with code `INPUT_INVALID` when the credential ID is empty or not canonical base64url, the PRF salt or output is not 32 bytes, or `secret` is empty.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 */
async function createSecretVault({
  credential,
  secret,
}: CreateSecretVaultInput): Promise<PasskeySecretVault> {
  const { transports, prfSalt, prfOutput } = credential;

  const credentialId = readBase64Url(
    credential.credentialId,
    "credential.credentialId",
    "INPUT_INVALID",
    { min: 1 },
  );

  if (prfSalt.length !== PRF_SALT_LENGTH) {
    throw new MeraError("INPUT_INVALID", "PRF salt must be 32 bytes");
  }

  if (secret.length === 0) {
    throw new MeraError("INPUT_INVALID", "secret must not be empty");
  }

  const prfSaltCopy = copyBytes(prfSalt);
  const prfOutputCopy = copyBytes(prfOutput);
  const secretCopy = copyBytes(secret);

  try {
    const wrappingKey = await deriveWrappingKey(prfOutputCopy);
    const encrypted = await aesGcmEncrypt({
      plaintext: secretCopy,
      wrappingKey,
      aad: SECRET_AAD,
    });

    return {
      version: 1,
      credential: {
        credentialId,
        ...(transports !== undefined ? { transports: [...transports] } : {}),
      },
      prfSalt: base64UrlEncode(prfSaltCopy),
      nonce: base64UrlEncode(encrypted.nonce),
      ciphertext: base64UrlEncode(encrypted.ciphertext),
    };
  } finally {
    prfOutputCopy.fill(0);
    secretCopy.fill(0);
  }
}

/** Inputs for decrypting a secret vault. */
type UnwrapSecretVaultInput = {
  /** Parsed secret vault. */
  vault: PasskeySecretVault;
  /** WebAuthn PRF output for the vault's PRF salt. Must be exactly 32 bytes. */
  prfOutput: Uint8Array;
};

/**
 * Decrypts the secret from a secret vault.
 *
 * @remarks
 * `prfOutput` is copied before async cryptographic work starts; post-call
 * mutation does not change the decryption result. The caller-owned buffer is
 * not modified or zeroed.
 *
 * @param options - Vault and PRF output; fields are documented on {@link UnwrapSecretVaultOptions}.
 * @returns The decrypted secret bytes, exactly as passed to `createSecretVault`. The returned buffer is a fresh allocation; the library keeps no reference to it and never zeroes it.
 * @throws MeraError with code `INPUT_INVALID` when `prfOutput` is not 32 bytes, or the vault's `nonce` or `ciphertext` is not valid base64url (already validated for vaults from `parseSecretVault`).
 * @throws MeraError with code `DECRYPT_FAILED` when authentication fails.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 */
async function unwrapSecretVault({
  vault,
  prfOutput,
}: UnwrapSecretVaultInput): Promise<Uint8Array<ArrayBuffer>> {
  const wrappingKey = await deriveWrappingKey(prfOutput);

  return aesGcmDecrypt({
    encrypted: {
      nonce: base64UrlDecode(vault.nonce),
      ciphertext: base64UrlDecode(vault.ciphertext),
    },
    wrappingKey,
    aad: SECRET_AAD,
  });
}

/**
 * Parses and validates untrusted secret-vault JSON or objects.
 *
 * Only version 1 vaults are accepted. The credential ID, PRF salt, nonce, and
 * ciphertext are validated as canonical base64url and length-checked. Unknown
 * fields are dropped from the returned vault.
 *
 * @param value - Secret vault as JSON text or an untrusted object.
 * @returns A validated secret vault.
 * @throws MeraError with code `VAULT_FORMAT_INVALID` when required structure, version, or encoded data is invalid.
 */
function parseSecretVault(value: unknown): PasskeySecretVault {
  const vault = typeof value === "string" ? parseJsonVault(value) : value;

  if (!isRecord(vault)) {
    throw new MeraError("VAULT_FORMAT_INVALID", "Vault must be an object");
  }

  if (vault.version !== 1) {
    throw new MeraError("VAULT_FORMAT_INVALID", "Vault version must be 1");
  }

  if (!isRecord(vault.credential)) {
    throw new MeraError(
      "VAULT_FORMAT_INVALID",
      "Vault credential must be an object",
    );
  }

  const credentialId = readBase64Url(
    vault.credential.credentialId,
    "credential.credentialId",
    "VAULT_FORMAT_INVALID",
    { min: 1 },
  );

  let transports: PasskeyCredentialTransport[] | undefined;

  if (vault.credential.transports !== undefined) {
    if (
      !Array.isArray(vault.credential.transports) ||
      vault.credential.transports.some(
        (transport) => typeof transport !== "string",
      )
    ) {
      throw new MeraError(
        "VAULT_FORMAT_INVALID",
        "credential.transports must be an array of strings or omitted",
      );
    }
    transports = [...vault.credential.transports];
  }

  const credential: PasskeySecretVault["credential"] = {
    credentialId,
    ...(transports !== undefined ? { transports } : {}),
  };

  const prfSalt = readBase64Url(
    vault.prfSalt,
    "prfSalt",
    "VAULT_FORMAT_INVALID",
    PRF_SALT_LENGTH,
  );
  const nonce = readBase64Url(
    vault.nonce,
    "nonce",
    "VAULT_FORMAT_INVALID",
    NONCE_LENGTH,
  );
  const ciphertext = readBase64Url(
    vault.ciphertext,
    "ciphertext",
    "VAULT_FORMAT_INVALID",
    { min: GCM_TAG_LENGTH },
  );

  // Allowlist: only v1 schema fields are copied, so unknown input keys are dropped.
  return { version: 1, credential, prfSalt, nonce, ciphertext };
}

/** Inputs for the WebAuthn assertion that unlocks a secret vault. */
type GetSecretVaultPrfOutputInput = {
  /** Relying party ID for the WebAuthn assertion. */
  rpId: string;
  /** Parsed secret vault. */
  vault: PasskeySecretVault;
  /** WebAuthn timeout in milliseconds. Browser defaults apply when omitted. */
  timeout?: number;
};

/**
 * Performs the WebAuthn assertion needed to unlock a secret vault.
 *
 * Reads the credential metadata and PRF salt from a parsed vault and delegates
 * to `getPasskeyPrfOutput`.
 *
 * @param options - Secret-vault PRF inputs; fields are documented on {@link GetSecretVaultPrfOutputOptions}.
 * @returns The selected credential ID and first WebAuthn PRF output.
 * @remarks
 * Invokes `navigator.credentials.get()`, which may show browser or
 * authenticator UI.
 *
 * The WebAuthn challenge is generated internally and the raw assertion
 * response is not returned.
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not return a usable 32-byte PRF output.
 * @throws MeraError with code `INPUT_INVALID` when the vault's `prfSalt` or `credentialId` is not canonical base64url (already validated for vaults from `parseSecretVault`).
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function getSecretVaultPrfOutput({
  rpId,
  vault,
  timeout,
}: GetSecretVaultPrfOutputInput): Promise<PasskeyPrfResult> {
  return getPasskeyPrfOutput({
    rpId,
    credential: vault.credential,
    prfSalt: base64UrlDecode(vault.prfSalt),
    ...(timeout !== undefined ? { timeout } : {}),
  });
}

/** Options accepted by `createSecretVault`. */
type CreateSecretVaultOptions = Parameters<typeof createSecretVault>[0];
/** Options accepted by `unwrapSecretVault`. */
type UnwrapSecretVaultOptions = Parameters<typeof unwrapSecretVault>[0];
/** Options accepted by `getSecretVaultPrfOutput`. */
type GetSecretVaultPrfOutputOptions = Parameters<
  typeof getSecretVaultPrfOutput
>[0];

export type {
  CreateSecretVaultOptions,
  GetSecretVaultPrfOutputOptions,
  UnwrapSecretVaultOptions,
};
export {
  createSecretVault,
  getSecretVaultPrfOutput,
  parseSecretVault,
  unwrapSecretVault,
};
