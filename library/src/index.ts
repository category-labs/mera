export { deriveEvmPrivateKey, getEvmAddress } from "./chains/evm.js";
export { deriveSolanaPrivateKey, getSolanaAddress } from "./chains/solana.js";
export { createEd25519SigningSession } from "./ed25519.js";
export type { MeraErrorCode } from "./errors.js";
export { MeraError, NewPasskeyError } from "./errors.js";
export { createPasskeyWithPrfOutput, getPasskeyPrfOutput } from "./passkey.js";
export { createSecp256k1SigningSession } from "./secp256k1.js";
export type {
  CreateSecretVaultWithExistingPasskeyOptions,
  CreateSecretVaultWithNewPasskeyOptions,
  DecryptSecretVaultWithPasskeyOptions,
} from "./secret.js";
export {
  createSecretVaultWithExistingPasskey,
  createSecretVaultWithNewPasskey,
  decryptSecretVaultWithPasskey,
  parseSecretVault,
} from "./secret.js";
export type {
  CreateSigningSessionOptions,
  DerivePrivateKeyOptions,
  Ed25519SigningSession,
  EvmAddress,
  PasskeyCredentialMetadata,
  PasskeyCredentialTransport,
  PasskeyRelyingParty,
  PasskeySecretVault,
  Secp256k1Signature,
  Secp256k1SigningSession,
} from "./types.js";
export type { WebAuthnClient } from "./webauthn.js";
