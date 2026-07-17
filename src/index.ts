export { getEvmAddress, isEvmAddress } from "./chains/evm.js";
export { getSolanaAddress, isSolanaAddress } from "./chains/solana.js";
export { getDeterministicPrfSaltV1 } from "./derived.js";
export { createEd25519SigningSession } from "./ed25519.js";
export type { MeraErrorCode } from "./errors.js";
export { isMeraError, MeraError } from "./errors.js";
export type {
  CreatePasskeyOptions,
  CreatePasskeyWithPrfOutputOptions,
  GetPasskeyPrfOutputOptions,
} from "./passkey.js";
export {
  createPasskey,
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
} from "./passkey.js";
export { createSecp256k1SigningSession } from "./secp256k1.js";
export type {
  CreateSecretVaultOptions,
  CreateSecretVaultWithExistingPasskeyOptions,
  CreateSecretVaultWithNewPasskeyOptions,
  DecryptSecretVaultOptions,
  DecryptSecretVaultWithPasskeyOptions,
  GetSecretVaultPrfOutputOptions,
} from "./secret.js";
export {
  createSecretVault,
  createSecretVaultWithExistingPasskey,
  createSecretVaultWithNewPasskey,
  decryptSecretVault,
  decryptSecretVaultWithPasskey,
  getSecretVaultPrfOutput,
  parseSecretVault,
} from "./secret.js";
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
  SolanaAddress,
} from "./types.js";
