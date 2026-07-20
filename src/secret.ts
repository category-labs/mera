import { utf8ToBytes } from "@noble/hashes/utils.js";
import {
  asArrayBuffer,
  base64UrlDecode,
  base64UrlEncode,
  copyBytes,
} from "./encoding.js";
import { MeraError } from "./errors.js";
import {
  assertCredentialApiAvailable,
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  toCredentialMetadata,
} from "./passkey.js";
import type {
  PasskeyCredentialMetadata,
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

// HKDF info and AAD for the secret vault. The HKDF info keeps the encryption key
// distinct from any other key derived from the same PRF output. The AAD is a
// fixed constant: vault fields such as the credential ID and PRF salt are
// deliberately not bound; see the Security remark on createSecretVault.
const SECRET_ENCRYPTION_INFO = utf8ToBytes("mera.v1.encrypt.secret");
const SECRET_AAD = utf8ToBytes("mera.v1.secret.aad");

/** AES-GCM encrypted bytes. */
type EncryptedBytes = {
  /** AES-GCM nonce. Secret vaults require 12 bytes. */
  nonce: Uint8Array;
  /** AES-GCM ciphertext including the authentication tag. */
  ciphertext: Uint8Array;
};

// Derives the vault encryption key. The 32-byte check validates caller-supplied
// PRF output at the public boundary before it becomes key material.
async function deriveEncryptionKey(prfOutput: Uint8Array): Promise<CryptoKey> {
  if (prfOutput.length !== PRF_OUTPUT_LENGTH) {
    throw new MeraError("INPUT_INVALID", "PRF output must be 32 bytes");
  }

  return hkdfSha256AesGcmKey(prfOutput, SECRET_ENCRYPTION_INFO);
}

// AES-256-GCM encrypt. subtle.encrypt copies its inputs synchronously and the
// caller owns the plaintext, so this helper has nothing of its own to zero.
// GCM nonces are generated internally so callers cannot accidentally reuse one.
async function aesGcmEncrypt({
  plaintext,
  encryptionKey,
  aad,
}: {
  plaintext: Uint8Array;
  encryptionKey: CryptoKey;
  aad: Uint8Array;
}): Promise<EncryptedBytes> {
  const iv = randomBytes(NONCE_LENGTH);

  const ciphertext = await getCrypto().subtle.encrypt(
    {
      name: "AES-GCM",
      iv: asArrayBuffer(iv),
      additionalData: asArrayBuffer(aad),
    },
    encryptionKey,
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
  encryptionKey,
  aad,
}: {
  encrypted: EncryptedBytes;
  encryptionKey: CryptoKey;
  aad: Uint8Array;
}): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const plaintext = await getCrypto().subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asArrayBuffer(encrypted.nonce),
        additionalData: asArrayBuffer(aad),
      },
      encryptionKey,
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

/** Reads a required base64url string field from untrusted vault data. */
function readVaultBase64Url(
  value: unknown,
  name: string,
  options: { byteLength?: number; minByteLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new MeraError("VAULT_FORMAT_INVALID", `${name} must be base64url`);
  }

  base64UrlDecode(value, { name, code: "VAULT_FORMAT_INVALID", ...options });
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Inputs for encrypting one arbitrary secret into a vault. */
type CreateSecretVaultInput = {
  /**
   * Passkey credential plus the PRF salt and PRF output it produced. Secret-vault
   * flows use a fresh salt for each secret.
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
 * An AES-256-GCM encryption key is derived from the PRF output with fixed
 * HKDF info (`mera.v1.encrypt.secret`), which separates it from other keys
 * derived from the same PRF output. The secret is encrypted under fixed
 * additional authenticated data (AAD).
 *
 * @remarks
 * The input byte buffers are copied before async cryptographic work starts;
 * post-call mutation does not change the vault being produced.
 *
 * Security: a vault is bound to its `prfOutput` only, not to the credential
 * ID or salt. Secrets encrypted using one reused PRF output share an encryption
 * key, so their nonce/ciphertext pairs are interchangeable by anyone who can
 * rewrite stored vault JSON; a fresh `prfSalt` per secret avoids the shared key.
 * @param options - Credential material and the secret to encrypt; fields are documented on {@link CreateSecretVaultOptions}.
 * @returns A JSON-safe secret vault.
 * @throws MeraError with code `INPUT_INVALID` when the credential ID is empty or not canonical base64url, the PRF salt or output is not 32 bytes, or `secret` is empty.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 */
async function createSecretVault({
  credential,
  secret,
}: CreateSecretVaultInput): Promise<PasskeySecretVault> {
  const { credentialId, transports, prfSalt, prfOutput } = credential;

  base64UrlDecode(credentialId, {
    name: "credential.credentialId",
    minByteLength: 1,
  });

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
    const encryptionKey = await deriveEncryptionKey(prfOutputCopy);
    const encrypted = await aesGcmEncrypt({
      plaintext: secretCopy,
      encryptionKey,
      aad: SECRET_AAD,
    });

    return {
      version: 1,
      credential: toCredentialMetadata(credentialId, transports),
      prfSalt: base64UrlEncode(prfSaltCopy),
      nonce: base64UrlEncode(encrypted.nonce),
      ciphertext: base64UrlEncode(encrypted.ciphertext),
    };
  } finally {
    prfOutputCopy.fill(0);
    secretCopy.fill(0);
  }
}

/** Inputs for creating a secret vault together with a new passkey. */
type CreateSecretVaultWithNewPasskeyInput = {
  /** Relying party identity passed directly to WebAuthn. `id` is required. */
  rp: PublicKeyCredentialRpEntity & { id: string };
  /** User identity passed to WebAuthn. `id` is copied before use. */
  user: {
    /** User handle. Must be 1 to 64 bytes when provided. */
    id?: Uint8Array;
    /** User name displayed or stored by the authenticator. */
    name: string;
    /** Human-readable display name for the authenticator UI. */
    displayName: string;
  };
  /** Secret bytes to encrypt. Any non-empty length. */
  secret: Uint8Array;
  /** WebAuthn timeout in milliseconds. Browser defaults apply when omitted. */
  timeout?: number;
};

/** Inputs for creating a secret vault with an existing passkey. */
type CreateSecretVaultWithExistingPasskeyInput = {
  /** Relying party ID for the WebAuthn assertion. */
  rpId: string;
  /** Credential metadata to restrict the assertion to one passkey. */
  credential?: PasskeyCredentialMetadata;
  /** Secret bytes to encrypt. Any non-empty length. */
  secret: Uint8Array;
  /** WebAuthn timeout in milliseconds. Browser defaults apply when omitted. */
  timeout?: number;
};

/** Copies and validates a secret before a WebAuthn ceremony can start. */
function copyNonEmptySecret(secret: Uint8Array): Uint8Array<ArrayBuffer> {
  if (secret.length === 0) {
    throw new MeraError("INPUT_INVALID", "secret must not be empty");
  }

  return copyBytes(secret);
}

/**
 * Checks WebAuthn before generating a random vault salt so ceremony helpers
 * keep their existing error precedence when WebAuthn and Web Crypto are both
 * unavailable.
 */
function getRandomVaultPrfSalt(): Uint8Array<ArrayBuffer> {
  assertCredentialApiAvailable();
  return randomBytes(PRF_SALT_LENGTH);
}

/**
 * Creates a passkey and encrypts one secret into a vault.
 *
 * A fresh random PRF salt is generated internally and stored in the returned
 * vault. The passkey creation may require a fallback assertion when the
 * authenticator does not evaluate PRF during creation.
 *
 * @param options - Passkey creation inputs and secret bytes; fields are documented on {@link CreateSecretVaultWithNewPasskeyOptions}.
 * @returns A JSON-safe secret vault containing the new credential metadata.
 * @remarks
 * Invokes `navigator.credentials.create()`, which may show browser or
 * authenticator UI. On authenticators that do not evaluate PRF during
 * creation, also invokes `navigator.credentials.get()`, which means a second
 * browser prompt.
 *
 * `secret` is copied and validated before either ceremony starts. Post-call
 * mutation does not change the encrypted secret. The internal secret and PRF
 * output are zeroed before the function finishes, even when it fails.
 *
 * If the fallback ceremony or vault encryption fails, the passkey from the
 * completed creation ceremony still exists on the authenticator, but the
 * thrown error does not carry its metadata.
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not enable PRF or return a usable 32-byte PRF output.
 * @throws MeraError with code `INPUT_INVALID` when `secret` is empty, or `user.id` is provided but not 1 to 64 bytes.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function createSecretVaultWithNewPasskey({
  rp,
  user,
  secret,
  timeout,
}: CreateSecretVaultWithNewPasskeyInput): Promise<PasskeySecretVault> {
  const secretCopy = copyNonEmptySecret(secret);
  let prfOutput: Uint8Array | undefined;

  try {
    const credential = await createPasskeyWithPrfOutput({
      rp,
      user,
      ...(timeout !== undefined ? { timeout } : {}),
      prfSalt: getRandomVaultPrfSalt(),
    });
    prfOutput = credential.prfOutput;

    return await createSecretVault({ credential, secret: secretCopy });
  } finally {
    secretCopy.fill(0);
    prfOutput?.fill(0);
  }
}

/**
 * Evaluates an existing passkey against a fresh random salt and encrypts one
 * secret into a vault.
 *
 * @param options - Passkey assertion inputs and secret bytes; fields are documented on {@link CreateSecretVaultWithExistingPasskeyOptions}.
 * @returns A JSON-safe secret vault containing the selected credential metadata.
 * @remarks
 * Invokes `navigator.credentials.get()`, which may show browser or
 * authenticator UI. When `credential` is omitted, WebAuthn may choose any
 * discoverable credential for the relying party.
 *
 * A fresh random PRF salt is generated internally and stored in the returned
 * vault. `secret` and `credential` are copied before the ceremony starts, so
 * post-call mutation does not change the operation. The internal secret and
 * PRF output are zeroed before the function finishes, even when it fails.
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not return a usable 32-byte PRF output.
 * @throws MeraError with code `INPUT_INVALID` when `secret` is empty, or `credential.credentialId` is empty or not canonical base64url.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function createSecretVaultWithExistingPasskey({
  rpId,
  credential,
  secret,
  timeout,
}: CreateSecretVaultWithExistingPasskeyInput): Promise<PasskeySecretVault> {
  const secretCopy = copyNonEmptySecret(secret);
  // Copied before async WebAuthn work starts.
  const credentialCopy =
    credential &&
    toCredentialMetadata(credential.credentialId, credential.transports);
  let prfOutput: Uint8Array | undefined;

  try {
    const prfSalt = getRandomVaultPrfSalt();
    const evaluated = await getPasskeyPrfOutput({
      rpId,
      ...(credentialCopy !== undefined ? { credential: credentialCopy } : {}),
      prfSalt,
      ...(timeout !== undefined ? { timeout } : {}),
    });
    prfOutput = evaluated.prfOutput;

    return await createSecretVault({
      credential: {
        credentialId: evaluated.credentialId,
        ...(credentialCopy?.credentialId === evaluated.credentialId &&
        credentialCopy.transports !== undefined
          ? { transports: credentialCopy.transports }
          : {}),
        prfSalt,
        prfOutput,
      },
      secret: secretCopy,
    });
  } finally {
    secretCopy.fill(0);
    prfOutput?.fill(0);
  }
}

/** Inputs for decrypting a secret vault. */
type DecryptSecretVaultInput = {
  /** Parsed secret vault. */
  vault: PasskeySecretVault;
  /** WebAuthn PRF output for the vault's PRF salt. Must be exactly 32 bytes. */
  prfOutput: Uint8Array;
};

/**
 * Decrypts the secret from a secret vault.
 *
 * @remarks
 * `prfOutput` is copied before async cryptographic work starts, so post-call
 * mutation does not change the decryption result.
 *
 * @param options - Vault and PRF output; fields are documented on {@link DecryptSecretVaultOptions}.
 * @returns The decrypted secret bytes, exactly as passed to `createSecretVault`. The returned buffer is a fresh allocation; the library keeps no reference to it.
 * @throws MeraError with code `INPUT_INVALID` when `prfOutput` is not 32 bytes, or the vault's `nonce` or `ciphertext` is not valid base64url (already validated for vaults from `parseSecretVault`).
 * @throws MeraError with code `DECRYPT_FAILED` when authentication fails.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 */
async function decryptSecretVault({
  vault,
  prfOutput,
}: DecryptSecretVaultInput): Promise<Uint8Array<ArrayBuffer>> {
  // The copy guarantee documented above is provided by hkdfSha256AesGcmKey,
  // which snapshots prfOutput synchronously before its first await.
  const encryptionKey = await deriveEncryptionKey(prfOutput);

  return aesGcmDecrypt({
    encrypted: {
      nonce: base64UrlDecode(vault.nonce),
      ciphertext: base64UrlDecode(vault.ciphertext),
    },
    encryptionKey,
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

  const credentialId = readVaultBase64Url(
    vault.credential.credentialId,
    "credential.credentialId",
    { minByteLength: 1 },
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
    transports = vault.credential.transports;
  }

  const credential = toCredentialMetadata(credentialId, transports);

  const prfSalt = readVaultBase64Url(vault.prfSalt, "prfSalt", {
    byteLength: PRF_SALT_LENGTH,
  });
  const nonce = readVaultBase64Url(vault.nonce, "nonce", {
    byteLength: NONCE_LENGTH,
  });
  const ciphertext = readVaultBase64Url(vault.ciphertext, "ciphertext", {
    minByteLength: GCM_TAG_LENGTH,
  });

  // Allowlist: only v1 schema fields are copied, so unknown input keys are dropped.
  return { version: 1, credential, prfSalt, nonce, ciphertext };
}

/** Copies a parsed vault before a WebAuthn ceremony can yield control. */
function copySecretVault(vault: PasskeySecretVault): PasskeySecretVault {
  return {
    version: vault.version,
    credential: toCredentialMetadata(
      vault.credential.credentialId,
      vault.credential.transports,
    ),
    prfSalt: vault.prfSalt,
    nonce: vault.nonce,
    ciphertext: vault.ciphertext,
  };
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
 * @throws MeraError with code `INPUT_INVALID` when the vault's `prfSalt` is not canonical base64url or does not decode to 32 bytes, or `credentialId` is empty or not canonical base64url (already validated for vaults from `parseSecretVault`).
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

/** Inputs for performing the passkey ceremony and decrypting a secret vault. */
type DecryptSecretVaultWithPasskeyInput = {
  /** Relying party ID for the WebAuthn assertion. */
  rpId: string;
  /** Parsed secret vault. Copied before use. */
  vault: PasskeySecretVault;
  /** WebAuthn timeout in milliseconds. Browser defaults apply when omitted. */
  timeout?: number;
};

/**
 * Performs the passkey assertion for a vault and decrypts its secret.
 *
 * @param options - Relying party and parsed vault; fields are documented on {@link DecryptSecretVaultWithPasskeyOptions}.
 * @returns The decrypted secret bytes. The returned buffer is a fresh allocation owned by the caller.
 * @remarks
 * Invokes `navigator.credentials.get()`, which may show browser or
 * authenticator UI. The assertion is restricted to the credential stored in
 * the vault.
 *
 * The vault is copied before the ceremony starts, so post-call mutation does
 * not change the assertion or ciphertext being decrypted. The internal PRF
 * output is zeroed before the function finishes, even when decryption
 * fails. The returned secret's lifetime belongs to the caller.
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not return a usable 32-byte PRF output.
 * @throws MeraError with code `INPUT_INVALID` when the vault contains an invalid credential ID, PRF salt, nonce, or ciphertext.
 * @throws MeraError with code `DECRYPT_FAILED` when authentication fails.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function decryptSecretVaultWithPasskey({
  rpId,
  vault,
  timeout,
}: DecryptSecretVaultWithPasskeyInput): Promise<Uint8Array<ArrayBuffer>> {
  const vaultCopy = copySecretVault(vault);
  const { prfOutput } = await getSecretVaultPrfOutput({
    rpId,
    vault: vaultCopy,
    ...(timeout !== undefined ? { timeout } : {}),
  });

  try {
    return await decryptSecretVault({ vault: vaultCopy, prfOutput });
  } finally {
    prfOutput.fill(0);
  }
}

/** Options accepted by `createSecretVault`. */
type CreateSecretVaultOptions = Parameters<typeof createSecretVault>[0];
/** Options accepted by `createSecretVaultWithExistingPasskey`. */
type CreateSecretVaultWithExistingPasskeyOptions = Parameters<
  typeof createSecretVaultWithExistingPasskey
>[0];
/** Options accepted by `createSecretVaultWithNewPasskey`. */
type CreateSecretVaultWithNewPasskeyOptions = Parameters<
  typeof createSecretVaultWithNewPasskey
>[0];
/** Options accepted by `decryptSecretVault`. */
type DecryptSecretVaultOptions = Parameters<typeof decryptSecretVault>[0];
/** Options accepted by `decryptSecretVaultWithPasskey`. */
type DecryptSecretVaultWithPasskeyOptions = Parameters<
  typeof decryptSecretVaultWithPasskey
>[0];
/** Options accepted by `getSecretVaultPrfOutput`. */
type GetSecretVaultPrfOutputOptions = Parameters<
  typeof getSecretVaultPrfOutput
>[0];

export type {
  CreateSecretVaultOptions,
  CreateSecretVaultWithExistingPasskeyOptions,
  CreateSecretVaultWithNewPasskeyOptions,
  DecryptSecretVaultOptions,
  DecryptSecretVaultWithPasskeyOptions,
  GetSecretVaultPrfOutputOptions,
};
export {
  createSecretVault,
  createSecretVaultWithExistingPasskey,
  createSecretVaultWithNewPasskey,
  decryptSecretVault,
  decryptSecretVaultWithPasskey,
  getSecretVaultPrfOutput,
  parseSecretVault,
};
