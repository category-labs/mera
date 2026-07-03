/**
 * A 20-byte EVM address with a `0x` prefix, lowercase or EIP-55 mixed case.
 *
 * Structural type only: the `0x${string}` shape does not constrain length or
 * hex digits. `isEvmAddress` is the authoritative runtime check.
 */
type EvmAddress = `0x${string}`;

/** WebAuthn authenticator transport metadata, including future browser transport values. */
type PasskeyCredentialTransport = AuthenticatorTransport | (string & {});

/** Metadata needed to ask WebAuthn for a previously created passkey. */
type PasskeyCredentialMetadata = {
  /** Credential ID encoded as canonical unpadded base64url. */
  credentialId: string;
  /** Authenticator transports reported by the browser, when available. */
  transports?: PasskeyCredentialTransport[];
};

/** Result of a successful passkey assertion with the WebAuthn PRF extension. */
type PasskeyPrfResult = {
  /** Credential ID selected by the browser, as canonical unpadded base64url. */
  credentialId: string;
  /** First PRF output from WebAuthn. Always 32 bytes. */
  prfOutput: Uint8Array;
};

/** Result of creating a passkey. */
type CreatePasskeyResult = PasskeyCredentialMetadata & {
  /** First WebAuthn PRF output when `prfSalt` was provided and evaluated during creation. */
  prfOutput?: Uint8Array;
};

/**
 * Result of creating a passkey together with its first PRF output.
 *
 * `prfSalt` is the salt WebAuthn evaluated, so downstream helpers (in
 * particular `createSecretVault`) can be invoked with this result alone.
 */
type CreatePasskeyWithPrfOutputResult = PasskeyCredentialMetadata & {
  /** PRF salt that was evaluated. Always 32 bytes and never aliases the caller input. */
  prfSalt: Uint8Array;
  /** First WebAuthn PRF output for `prfSalt`. Always 32 bytes. */
  prfOutput: Uint8Array;
};

/**
 * Versioned JSON-safe vault holding one arbitrary secret encrypted behind a passkey.
 *
 * The secret bytes are opaque to the library; callers decide what they mean.
 */
type PasskeySecretVault = {
  /** Secret-vault format version. */
  version: 1;
  /** Passkey credential that unlocks this secret. */
  credential: PasskeyCredentialMetadata;
  /** PRF salt for this secret, as canonical unpadded base64url. */
  prfSalt: string;
  /** AES-GCM nonce as canonical unpadded base64url. */
  nonce: string;
  /** AES-GCM ciphertext (including tag) as canonical unpadded base64url. */
  ciphertext: string;
};

/** secp256k1 ECDSA signature returned by an unlocked signing session. */
type Secp256k1Signature = {
  /** Compact 64-byte `r || s` ECDSA signature. */
  compact: Uint8Array;
  /** Recovery ID (0 or 1) for the signature. */
  recovery: number;
};

/** Inputs for creating an explicitly lockable curve signing session. */
type CreateSigningSessionOptions = {
  /**
   * Curve private key. Must be exactly 32 bytes; secp256k1 must also be a valid scalar.
   *
   * Copied into one session-owned snapshot; the input is zeroed before the call returns or throws.
   */
  consumePrivateKey: Uint8Array;
};

/** secp256k1 signing session that can sign 32-byte digests until `lock` is called. */
type Secp256k1SigningSession = {
  /** Uncompressed secp256k1 public key for the session. */
  publicKey: Uint8Array;
  /**
   * Signs a 32-byte digest without prehashing it.
   *
   * @param digest32 - Exactly 32 bytes to sign; copied before use, the original buffer is not modified.
   * @returns A compact secp256k1 ECDSA signature with its recovery ID.
   * @throws MeraError with code `INPUT_INVALID` when `digest32` is not 32 bytes.
   * @throws MeraError with code `SESSION_LOCKED` after `lock` has been called.
   */
  signDigest(digest32: Uint8Array): Promise<Secp256k1Signature>;
  /**
   * Zeroes the session-owned private-key copy and permanently locks this session; later signing throws `SESSION_LOCKED`.
   *
   * @remarks If `lock` is called while a sign on the same session is still in flight, the calls race and the in-flight signature's result is unspecified.
   */
  lock(): void;
};

/** Ed25519 signing session that can sign messages until `lock` is called. */
type Ed25519SigningSession = {
  /** 32-byte Ed25519 public key for the session. */
  publicKey: Uint8Array;
  /**
   * Signs an arbitrary-length message with Ed25519.
   *
   * @param message - Message bytes to sign; copied before use, the original buffer is not modified. Hashing happens inside Ed25519 itself.
   * @returns A 64-byte Ed25519 signature (`R || s`).
   * @throws MeraError with code `SESSION_LOCKED` after `lock` has been called.
   */
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  /**
   * Zeroes the session-owned seed copy and permanently locks this session; later signing throws `SESSION_LOCKED`.
   *
   * @remarks If `lock` is called while a sign on the same session is still in flight, the calls race and the in-flight signature's result is unspecified.
   */
  lock(): void;
};

export type {
  CreatePasskeyResult,
  CreatePasskeyWithPrfOutputResult,
  CreateSigningSessionOptions,
  Ed25519SigningSession,
  EvmAddress,
  PasskeyCredentialMetadata,
  PasskeyCredentialTransport,
  PasskeyPrfResult,
  PasskeySecretVault,
  Secp256k1Signature,
  Secp256k1SigningSession,
};
