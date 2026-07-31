import { utf8ToBytes } from "@noble/hashes/utils.js";
import {
  asArrayBuffer,
  base64UrlDecode,
  base64UrlEncode,
  copyBytes,
} from "./encoding.js";
import { MeraError } from "./errors.js";
import type {
  CreatePasskeyWithPrfOutputOptions,
  GetPasskeyPrfOutputOptions,
} from "./passkey.js";
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  toCredentialMetadata,
} from "./passkey.js";
import type {
  CreatePasskeyWithPrfOutputResult,
  PasskeyCredentialTransport,
  PasskeySecretVault,
} from "./types.js";
import { getCrypto, randomBytes } from "./webcrypto.js";

const PRF_SALT_LENGTH = 32;
const NONCE_LENGTH = 12;
// AES-256-GCM authentication tag length in bytes (WebCrypto's 128-bit default,
// since createSecretVault does not set tagLength). Ciphertext carries its tag,
// so any authentic ciphertext is at least this long.
const GCM_TAG_LENGTH = 16;

// HKDF info keeps the encryption key distinct from any other key derived from
// the same PRF output.
const SECRET_ENCRYPTION_INFO = utf8ToBytes("mera.v1.encrypt.secret");

// Derives the non-extractable AES-256-GCM vault key with HKDF-SHA-256. The
// 32-byte check validates the key material before it reaches HKDF.
//
// prfOutput reaches importKey uncopied so that the caller's zeroing covers
// every buffer holding these bytes. importKey reads the buffer before its
// promise settles, so a later fill cannot race the import.
async function deriveEncryptionKey(
  prfOutput: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  if (prfOutput.length !== 32) {
    throw new MeraError("INPUT_INVALID", "PRF output must be 32 bytes");
  }

  const crypto = getCrypto();
  const material = await crypto.subtle.importKey(
    "raw",
    prfOutput,
    "HKDF",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: asArrayBuffer(SECRET_ENCRYPTION_INFO),
    },
    material,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
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

/** Inputs for `createSecretVault`. */
type CreateSecretVaultOptions = {
  /** Credential metadata plus the PRF salt and PRF output that key this secret. */
  credential: CreatePasskeyWithPrfOutputResult;
  /** Secret bytes to encrypt. */
  secret: Uint8Array<ArrayBuffer>;
};

/**
 * Encrypts a secret into a passkey-protected vault.
 *
 * An AES-256-GCM encryption key is derived from the PRF output with fixed
 * HKDF info (`mera.v1.encrypt.secret`), which separates it from other keys
 * derived from the same PRF output.
 *
 * A vault is bound to its PRF output only, not to the credential ID or salt:
 * vaults encrypted with one reused PRF output share an encryption key, so each
 * secret needs a fresh salt.
 *
 * Inputs arrive validated and caller-owned; callers own the pre-ceremony
 * snapshots and the zeroing.
 *
 * @returns A JSON-safe secret vault.
 * @throws MeraError with code `INPUT_INVALID` when the PRF output is not 32 bytes.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @internal
 */
async function createSecretVault({
  credential,
  secret,
}: CreateSecretVaultOptions): Promise<PasskeySecretVault> {
  const encryptionKey = await deriveEncryptionKey(credential.prfOutput);

  // The GCM nonce is generated internally so callers cannot accidentally reuse
  // one. secret reaches encrypt uncopied, like the PRF output above.
  const nonce = randomBytes(NONCE_LENGTH);
  const ciphertext = await getCrypto().subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
    },
    encryptionKey,
    secret,
  );

  return {
    version: 1,
    credential: toCredentialMetadata(
      credential.credentialId,
      credential.transports,
    ),
    prfSalt: base64UrlEncode(credential.prfSalt),
    nonce: base64UrlEncode(nonce),
    ciphertext: base64UrlEncode(new Uint8Array(ciphertext)),
  };
}

/** Inputs for creating a secret vault together with a new passkey. */
type CreateSecretVaultWithNewPasskeyOptions = Omit<
  CreatePasskeyWithPrfOutputOptions,
  "prfSalt"
> & {
  /** Secret bytes to encrypt. Any non-empty length. */
  secret: Uint8Array;
};

/** Inputs for creating a secret vault with an existing passkey. */
type CreateSecretVaultWithExistingPasskeyOptions = Omit<
  GetPasskeyPrfOutputOptions,
  "prfSalt"
> & {
  /** Secret bytes to encrypt. Any non-empty length. */
  secret: Uint8Array;
};

/** Copies and validates a secret before a WebAuthn ceremony can start. */
function copyNonEmptySecret(secret: Uint8Array): Uint8Array<ArrayBuffer> {
  if (secret.length === 0) {
    throw new MeraError("INPUT_INVALID", "secret must not be empty");
  }

  return copyBytes(secret);
}

/**
 * Creates a passkey and encrypts one secret into a vault.
 *
 * @param options - Passkey creation inputs and secret bytes.
 * @returns A JSON-safe secret vault containing the new credential metadata.
 * @remarks
 * Invokes `navigator.credentials.create()` and shows one user-verification
 * prompt. On authenticators that do not evaluate PRF during creation, also
 * invokes `navigator.credentials.get()`, which shows a second.
 *
 * A fresh random PRF salt is generated internally and stored in the returned
 * vault.
 *
 * A fresh random user handle (`user.id`) is generated for the new credential,
 * so each call adds a passkey instead of replacing one.
 *
 * If the fallback ceremony or vault encryption fails, the passkey from the
 * completed creation ceremony still exists on the authenticator, but the
 * thrown error does not carry its metadata.
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not enable PRF or return a usable 32-byte PRF output.
 * @throws MeraError with code `INPUT_INVALID` when `secret` is empty.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function createSecretVaultWithNewPasskey({
  rp,
  user,
  secret,
  timeout,
}: CreateSecretVaultWithNewPasskeyOptions): Promise<PasskeySecretVault> {
  const secretCopy = copyNonEmptySecret(secret);
  let prfOutput: Uint8Array<ArrayBuffer> | undefined;

  try {
    const credential = await createPasskeyWithPrfOutput({
      rp,
      user,
      ...(timeout !== undefined ? { timeout } : {}),
      prfSalt: randomBytes(PRF_SALT_LENGTH),
    });
    prfOutput = credential.prfOutput;

    return await createSecretVault({ credential, secret: secretCopy });
  } finally {
    secretCopy.fill(0);
    prfOutput?.fill(0);
  }
}

/**
 * Evaluates an existing passkey and encrypts one secret into a vault.
 *
 * @param options - Passkey assertion inputs and secret bytes.
 * @returns A JSON-safe secret vault containing the selected credential metadata.
 * @remarks
 * Invokes `navigator.credentials.get()` and shows one user-verification
 * prompt.
 *
 * A fresh random PRF salt is generated internally and stored in the returned
 * vault.
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
}: CreateSecretVaultWithExistingPasskeyOptions): Promise<PasskeySecretVault> {
  const secretCopy = copyNonEmptySecret(secret);
  // Copied before async WebAuthn work starts.
  const credentialCopy =
    credential &&
    toCredentialMetadata(credential.credentialId, credential.transports);
  let prfOutput: Uint8Array<ArrayBuffer> | undefined;

  try {
    const prfSalt = randomBytes(PRF_SALT_LENGTH);
    const evaluated = await getPasskeyPrfOutput({
      rpId,
      ...(credentialCopy !== undefined ? { credential: credentialCopy } : {}),
      prfSalt,
      ...(timeout !== undefined ? { timeout } : {}),
    });
    prfOutput = evaluated.prfOutput;

    // Reuse the caller's metadata (with its transports) only when the browser
    // selected that same credential.
    const credentialMetadata =
      credentialCopy?.credentialId === evaluated.credentialId
        ? credentialCopy
        : { credentialId: evaluated.credentialId };

    return await createSecretVault({
      credential: { ...credentialMetadata, prfSalt, prfOutput },
      secret: secretCopy,
    });
  } finally {
    secretCopy.fill(0);
    prfOutput?.fill(0);
  }
}

/** Inputs for decrypting a secret vault. */
type DecryptSecretVaultOptions = {
  /** Secret vault to decrypt. */
  vault: PasskeySecretVault;
  /** WebAuthn PRF output for the vault's PRF salt. Must be exactly 32 bytes. */
  prfOutput: Uint8Array<ArrayBuffer>;
};

/**
 * Decrypts the secret from a secret vault with a PRF output.
 *
 * Decoding the vault's `nonce` and `ciphertext` strings here doubles as
 * validation for direct callers that skip `parseSecretVault`.
 *
 * @returns The decrypted secret bytes in a fresh allocation.
 * @throws MeraError with code `INPUT_INVALID` when `prfOutput` is not 32 bytes, or the vault's `nonce` or `ciphertext` is not valid base64url.
 * @throws MeraError with code `DECRYPT_FAILED` when AES-GCM authentication fails.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @internal
 */
async function decryptSecretVault({
  vault,
  prfOutput,
}: DecryptSecretVaultOptions): Promise<Uint8Array<ArrayBuffer>> {
  const encryptionKey = await deriveEncryptionKey(prfOutput);
  const nonce = base64UrlDecode(vault.nonce);
  const ciphertext = base64UrlDecode(vault.ciphertext);

  // Only the decrypt call sits in the try: its catch maps every failure to
  // DECRYPT_FAILED, so getCrypto's CRYPTO_UNAVAILABLE must be raised first.
  const crypto = getCrypto();

  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asArrayBuffer(nonce),
      },
      encryptionKey,
      asArrayBuffer(ciphertext),
    );
    return new Uint8Array(plaintext);
  } catch (error) {
    throw new MeraError("DECRYPT_FAILED", "Unable to decrypt ciphertext", {
      cause: error,
    });
  }
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

/** Inputs for decrypting a secret vault with a passkey. */
type DecryptSecretVaultWithPasskeyOptions = {
  /** Relying party ID for the WebAuthn assertion. */
  rpId: string;
  /** Secret vault to decrypt. */
  vault: PasskeySecretVault;
  /** WebAuthn timeout in milliseconds. Browser defaults apply when omitted. */
  timeout?: number;
};

/**
 * Performs the passkey assertion for a vault and decrypts its secret.
 *
 * @param options - Relying party ID and vault.
 * @returns The decrypted secret bytes in a fresh allocation.
 * @remarks
 * Invokes `navigator.credentials.get()` and shows one user-verification
 * prompt. The assertion is restricted to the credential stored in the vault.
 * @throws MeraError with code `VAULT_FORMAT_INVALID` when the vault's required structure, version, or encoded data is invalid.
 * @throws MeraError with code `PRF_UNAVAILABLE` when the authenticator does not return a usable 32-byte PRF output.
 * @throws MeraError with code `DECRYPT_FAILED` when AES-GCM authentication fails.
 * @throws MeraError with code `CRYPTO_UNAVAILABLE` when Web Crypto is unavailable.
 * @throws MeraError with code `PASSKEY_OPERATION_FAILED` when WebAuthn is unavailable, cancelled, or returns an unexpected credential.
 */
async function decryptSecretVaultWithPasskey({
  rpId,
  vault,
  timeout,
}: DecryptSecretVaultWithPasskeyOptions): Promise<Uint8Array<ArrayBuffer>> {
  const parsedVault = parseSecretVault(vault);
  const { prfOutput } = await getPasskeyPrfOutput({
    rpId,
    credential: parsedVault.credential,
    prfSalt: base64UrlDecode(parsedVault.prfSalt),
    ...(timeout !== undefined ? { timeout } : {}),
  });

  try {
    return await decryptSecretVault({ vault: parsedVault, prfOutput });
  } finally {
    prfOutput.fill(0);
  }
}

export type {
  CreateSecretVaultWithExistingPasskeyOptions,
  CreateSecretVaultWithNewPasskeyOptions,
  DecryptSecretVaultWithPasskeyOptions,
};
export {
  createSecretVault,
  createSecretVaultWithExistingPasskey,
  createSecretVaultWithNewPasskey,
  decryptSecretVault,
  decryptSecretVaultWithPasskey,
  parseSecretVault,
};
