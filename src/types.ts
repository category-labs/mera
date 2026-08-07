/**
 * A 20-byte EVM address as `0x`-prefixed hex.
 *
 * Structural type only: the `0x${string}` shape does not constrain length or
 * hex digits.
 */
type EvmAddress = `0x${string}`;

declare const brand: unique symbol;

/**
 * Nominal branding helper: tags `T` with a type-only discriminant.
 *
 * The symbol key is never exported, so branded values cannot be produced
 * structurally or read back as a property.
 */
type Brand<T, Name extends string> = T & { readonly [brand]: Name };

/**
 * A base58-encoded 32-byte Solana address.
 *
 * Branded nominal type minted by `getSolanaAddress`; at runtime the value is
 * a plain string.
 */
type SolanaAddress = Brand<string, "SolanaAddress">;

/** Relying party identity WebAuthn stores with a passkey. */
type PasskeyRelyingParty = {
  /** Relying party ID: the host the passkey is scoped to. */
  readonly id: string;
  /** Relying party name the authenticator may show. */
  readonly name: string;
};

/**
 * WebAuthn authenticator transport.
 *
 * The literals are WebAuthn's registered transports, spelled out rather than
 * taken from `lib.dom` so the public API also types in runtimes without the
 * DOM. The `string & {}` arm accepts any string without collapsing the union
 * to plain `string`, so editors keep offering the known literals in
 * autocomplete.
 */
type PasskeyCredentialTransport =
  | "ble"
  | "hybrid"
  | "internal"
  | "nfc"
  | "smart-card"
  | "usb"
  | (string & {});

/** Metadata needed to ask WebAuthn for a previously created passkey. */
type PasskeyCredentialMetadata = {
  /** Credential ID encoded as canonical unpadded base64url. */
  readonly credentialId: string;
  /** Authenticator transports reported by the platform, when available. */
  readonly transports?: readonly PasskeyCredentialTransport[];
};

/** Result of a passkey assertion with the WebAuthn PRF extension. */
type PasskeyPrfResult = {
  /** Credential ID selected by the platform, as canonical unpadded base64url. */
  readonly credentialId: string;
  /** First PRF output from WebAuthn. Always 32 bytes. */
  readonly prfOutput: Uint8Array<ArrayBuffer>;
};

/** Result of creating a passkey together with its first PRF output. */
type CreatePasskeyWithPrfOutputResult = PasskeyCredentialMetadata & {
  /**
   * PRF salt that WebAuthn evaluated. Always 32 bytes, in a fresh allocation.
   */
  readonly prfSalt: Uint8Array<ArrayBuffer>;
  /** First WebAuthn PRF output for `prfSalt`. Always 32 bytes. */
  readonly prfOutput: Uint8Array<ArrayBuffer>;
};

/**
 * Versioned JSON-safe vault holding one secret encrypted behind a passkey.
 * The secret bytes are opaque to the library.
 */
type PasskeySecretVault = {
  /** Secret-vault format version. */
  readonly version: 1;
  /** Passkey credential that unlocks this secret. */
  readonly credential: PasskeyCredentialMetadata;
  /** PRF salt for this secret, as canonical unpadded base64url. */
  readonly prfSalt: string;
  /** AES-GCM nonce as canonical unpadded base64url. */
  readonly nonce: string;
  /** AES-GCM ciphertext (including tag) as canonical unpadded base64url. */
  readonly ciphertext: string;
};

/** A secp256k1 ECDSA signature. */
type Secp256k1Signature = {
  /** Compact 64-byte `r || s` ECDSA signature. */
  readonly compact: Uint8Array<ArrayBuffer>;
  /** Recovery ID (the y-parity bit). */
  readonly recovery: 0 | 1;
};

/** Inputs for creating a curve signing session. */
type CreateSigningSessionOptions = {
  /**
   * Curve private key. Must be exactly 32 bytes and, for secp256k1, a valid
   * scalar.
   */
  privateKey: Uint8Array;
};

/** Members shared by every signing session. */
type SigningSession = {
  /**
   * Zeroes the session-owned private-key copy; later signing throws
   * `SESSION_ENDED`.
   */
  end(): void;
  /**
   * Calls `end`, so a `using` declaration ends the session when its scope
   * exits.
   */
  [Symbol.dispose](): void;
};

/** secp256k1 signing session that can sign 32-byte digests until `end` is called. */
type Secp256k1SigningSession = SigningSession & {
  /** 65-byte uncompressed secp256k1 public key for the session. */
  readonly publicKey: Uint8Array<ArrayBuffer>;
  /**
   * Signs a 32-byte digest without prehashing it.
   *
   * @param digest32 - The digest to sign.
   * @returns A compact secp256k1 ECDSA signature with its recovery ID.
   * @throws MeraError with code `INPUT_INVALID` when `digest32` is not 32 bytes.
   * @throws MeraError with code `SESSION_ENDED` after `end` has been called.
   */
  signDigest(digest32: Uint8Array): Promise<Secp256k1Signature>;
};

/** Ed25519 signing session that can sign messages until `end` is called. */
type Ed25519SigningSession = SigningSession & {
  /** 32-byte Ed25519 public key for the session. */
  readonly publicKey: Uint8Array<ArrayBuffer>;
  /**
   * Signs an arbitrary-length message.
   *
   * @param message - The message to sign; hashing happens inside Ed25519 itself.
   * @returns A 64-byte Ed25519 signature (`R || s`).
   * @throws MeraError with code `SESSION_ENDED` after `end` has been called.
   */
  signMessage(message: Uint8Array): Promise<Uint8Array<ArrayBuffer>>;
};

export type {
  CreatePasskeyWithPrfOutputResult,
  CreateSigningSessionOptions,
  Ed25519SigningSession,
  EvmAddress,
  PasskeyCredentialMetadata,
  PasskeyCredentialTransport,
  PasskeyPrfResult,
  PasskeyRelyingParty,
  PasskeySecretVault,
  Secp256k1Signature,
  Secp256k1SigningSession,
  SolanaAddress,
};
